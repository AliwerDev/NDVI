"""Tests for the Telegram bot logic. No Telegram connection: delivery is replaced."""

from datetime import date
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.bot import messages, notify
from app.bot.subscriptions import StartPayload, list_user_fields, parse_start_payload
from app.config import get_settings
from app.models import Field, User
from app.services.alerts import detect_alerts, detect_drop, pending_alerts
from app.services.history import save_observation
from tests.conftest import TELEGRAM_USER_ID
from tests.factories import make_result


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        ("login_abc", StartPayload("login", "abc")),
        ("link_a_b-c", StartPayload("link", "a_b-c")),
        (None, None),
        ("", None),
        ("link_", None),
        ("other_abc", None),
        ("3", None),
    ],
)
def test_parse_start_payload(args: str | None, expected: StartPayload | None) -> None:
    assert parse_start_payload(args) == expected


def test_fields_command_lists_the_users_fields(db_session: Session, field: Field) -> None:
    # A Telegram account without a website account sees no fields.
    assert list_user_fields(db_session, 42) == messages.NO_FIELDS

    assert "hali NDVI" in list_user_fields(db_session, TELEGRAM_USER_ID)

    save_observation(db_session, field.id, make_result(18, 0.634))
    text = list_user_fields(db_session, TELEGRAM_USER_ID)
    assert "Paxta-1 — NDVI 0.63 (18.10.2026)" in text


def test_alert_message_is_uzbek() -> None:
    text = messages.ndvi_drop_alert("Paxta-1", date(2026, 10, 10), 0.75, date(2026, 10, 18), 0.45, 0.30)

    assert "«Paxta-1» maydonida NDVI keskin tushdi" in text
    assert "10.10.2026: 0.75" in text
    assert "18.10.2026: 0.45" in text
    assert "Pasayish: 0.30" in text


@pytest.fixture
def drop_alert(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.75))
    observation = save_observation(db_session, field.id, make_result(18, 0.45))
    detect_drop(db_session, observation, 0.15)


def _use_token(monkeypatch: pytest.MonkeyPatch, token: str | None) -> None:
    settings = get_settings().model_copy(update={"telegram_bot_token": token})
    monkeypatch.setattr(notify, "get_settings", lambda: settings)


def _fake_delivery(monkeypatch: pytest.MonkeyPatch) -> list[list[tuple[int, str]]]:
    outboxes: list[list[tuple[int, str]]] = []

    async def fake_deliver(token: str, outbox: list[tuple[int, str]]) -> int:
        outboxes.append(outbox)
        return len(outbox)

    _use_token(monkeypatch, "123:TEST")
    monkeypatch.setattr(notify, "deliver", fake_deliver)
    return outboxes


def test_alert_goes_to_owners_telegram(db_session: Session, drop_alert: None, monkeypatch: pytest.MonkeyPatch) -> None:
    outboxes = _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 1
    [(chat_id, text)] = outboxes[0]
    assert chat_id == TELEGRAM_USER_ID
    assert "NDVI keskin tushdi" in text
    assert pending_alerts(db_session) == []


def test_alert_of_owner_without_telegram_is_marked_sent(
    db_session: Session, user: User, drop_alert: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    user.telegram_id = None
    db_session.commit()
    outboxes = _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 0
    assert outboxes == []
    # A later Telegram link must not get this old alert.
    assert pending_alerts(db_session) == []


def test_alerts_stay_pending_without_token(
    db_session: Session, drop_alert: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _use_token(monkeypatch, None)

    def fail(*args: Any) -> None:
        raise AssertionError("must not send")

    monkeypatch.setattr(notify, "deliver", fail)

    assert notify.send_pending_alerts(db_session) == 0
    assert len(pending_alerts(db_session)) == 1


def test_fields_line_shows_ndmi_and_ndre_when_present() -> None:
    line = messages.field_line(3, "Paxta-1", 0.634, date(2026, 10, 18), -0.05, 0.181)

    assert line == "3. Paxta-1 — NDVI 0.63, NDMI -0.05, NDRE 0.18 (18.10.2026)"


def test_ndmi_messages() -> None:
    stress = messages.ndmi_stress_alert("Paxta-1", date(2026, 8, 15), 0.04, date(2026, 8, 30), -0.05, 0.09, 0.0)
    drop = messages.ndmi_stress_alert("Paxta-1", date(2026, 7, 16), 0.22, date(2026, 7, 31), 0.12, 0.10, 0.0)

    assert "Suv stressi! «Paxta-1» maydonida NDMI chegaradan pastga tushdi" in stress
    assert "30.08.2026: -0.05" in stress and "Chegara: 0.00" in stress
    assert "«Paxta-1» maydonida NDMI keskin tushdi" in drop
    assert "Pasayish: 0.10" in drop


def test_ndre_message() -> None:
    text = messages.ndre_low_alert("Paxta-1", date(2026, 8, 30), 0.18, 0.62, 0.20, "Azot kam.")

    assert "Azot tavsiyasi: «Paxta-1»" in text
    assert "30.08.2026: NDRE 0.18 (chegara 0.20)" in text
    assert "Azot kam." in text


def test_water_and_nitrogen_alerts_are_sent(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch
) -> None:
    save_observation(db_session, field.id, make_result(10, 0.62, ndmi=0.04, ndre=0.25))
    observation = save_observation(db_session, field.id, make_result(18, 0.62, ndmi=-0.05, ndre=0.18))
    detect_alerts(db_session, observation, get_settings())
    outboxes = _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 2
    texts = [text for _, text in outboxes[0]]
    assert any("Suv stressi" in text for text in texts)
    assert any("Azot tavsiyasi" in text and "azot yetishmasligi" in text for text in texts)
