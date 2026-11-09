"""Tests for the Telegram bot logic. No Telegram connection: delivery is replaced."""

from datetime import date
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.bot import messages, notify
from app.bot.subscriptions import (
    StartPayload,
    link_chat,
    list_chat_fields,
    parse_field_id,
    parse_start_payload,
    subscribed_chat_ids,
    unlink_chat,
)
from app.config import get_settings
from app.models import Field
from app.services.alerts import detect_drop, pending_alerts
from app.services.history import save_observation
from tests.conftest import TELEGRAM_USER_ID
from tests.factories import make_result

CHAT = 123456789


@pytest.mark.parametrize(
    ("args", "expected"),
    [("3", 3), (" 12 ", 12), ("7 extra", 7), (None, None), ("", None), ("abc", None), ("-1", None)],
)
def test_parse_field_id(args: str | None, expected: int | None) -> None:
    assert parse_field_id(args) == expected


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


def test_link_and_unlink(db_session: Session, field: Field) -> None:
    assert link_chat(db_session, CHAT, field.id, TELEGRAM_USER_ID) == messages.linked("Paxta-1")
    assert link_chat(db_session, CHAT, field.id, TELEGRAM_USER_ID) == messages.already_linked("Paxta-1")
    assert subscribed_chat_ids(db_session, field.id) == [CHAT]

    assert unlink_chat(db_session, CHAT, field.id) == messages.unlinked(field.id)
    assert unlink_chat(db_session, CHAT, field.id) == messages.not_linked(field.id)
    assert subscribed_chat_ids(db_session, field.id) == []


def test_link_unknown_field(db_session: Session) -> None:
    assert link_chat(db_session, CHAT, 999999, TELEGRAM_USER_ID) == messages.field_not_found(999999)


def test_link_refuses_other_telegram_account(db_session: Session, field: Field) -> None:
    assert link_chat(db_session, CHAT, field.id, 42) == messages.field_not_found(field.id)
    assert subscribed_chat_ids(db_session, field.id) == []


def test_list_fields_shows_latest_ndvi(db_session: Session, field: Field) -> None:
    assert list_chat_fields(db_session, CHAT) == messages.NO_FIELDS

    link_chat(db_session, CHAT, field.id, TELEGRAM_USER_ID)
    assert "hali NDVI" in list_chat_fields(db_session, CHAT)

    save_observation(db_session, field.id, make_result(18, 0.634))
    text = list_chat_fields(db_session, CHAT)
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


def test_send_pending_alerts_to_subscribers(
    db_session: Session, field: Field, drop_alert: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    link_chat(db_session, CHAT, field.id, TELEGRAM_USER_ID)
    link_chat(db_session, CHAT + 1, field.id, TELEGRAM_USER_ID)
    outboxes: list[list[tuple[int, str]]] = []

    async def fake_deliver(token: str, outbox: list[tuple[int, str]]) -> int:
        outboxes.append(outbox)
        return len(outbox)

    _use_token(monkeypatch, "123:TEST")
    monkeypatch.setattr(notify, "deliver", fake_deliver)

    sent = notify.send_pending_alerts(db_session)

    assert sent == 2
    assert sorted(chat for chat, _ in outboxes[0]) == [CHAT, CHAT + 1]
    assert "NDVI keskin tushdi" in outboxes[0][0][1]
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
