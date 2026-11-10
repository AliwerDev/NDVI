"""Tests for frost and heat warnings, and for the weather lines in Telegram alerts."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from app.bot import messages, notify
from app.config import get_settings
from app.models import Field, User
from app.services.alerts import detect_drop
from app.services.history import save_observation
from app.services.weather import DailyWeather, summary_before, upsert_days
from app.services.weather_alerts import detect_for_field, pending_weather_alerts
from tests.conftest import TELEGRAM_USER_ID
from tests.factories import make_result
from tests.test_bot import _fake_delivery

TODAY = date(2026, 10, 20)
CELL = (41.3, 69.2)


def _store(db: Session, start: date, t_min: list[float], t_max: float = 20.0, today: date = TODAY) -> None:
    """Store one day per t_min value, from `start`."""
    days = [
        DailyWeather(
            day=start + timedelta(days=i), t_max=t_max, t_min=value, precipitation=1.0, et0=3.0, wind_max=2.0
        )
        for i, value in enumerate(t_min)
    ]
    upsert_days(db, CELL, days, today)


@pytest.fixture
def growing(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(15, 0.6))


def _detect(db: Session, field: Field, today: date = TODAY) -> list[tuple[str, date, date, float]]:
    return [(a.kind, a.day, a.last_day, a.value) for a in detect_for_field(db, field, today, get_settings())]


# --- detection ---


def test_frost_period_gives_one_warning(db_session: Session, field: Field, growing: None) -> None:
    # today, +1 ... +3
    _store(db_session, TODAY, [4.0, 1.0, -2.5, -0.5])

    assert _detect(db_session, field) == [("frost", TODAY + timedelta(days=2), TODAY + timedelta(days=3), -2.5)]


def test_period_that_started_today_is_not_new(db_session: Session, field: Field, growing: None) -> None:
    _store(db_session, TODAY, [-1.0, -3.0, 2.0, 3.0])

    assert _detect(db_session, field) == []


def test_bare_field_gets_no_warning(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(15, 0.15))
    _store(db_session, TODAY, [4.0, -5.0, -5.0, -5.0])

    assert _detect(db_session, field) == []


def test_moved_forecast_does_not_repeat_the_warning(db_session: Session, field: Field, growing: None) -> None:
    # Frost on day +3
    _store(db_session, TODAY, [4.0, 3.0, 2.0, -2.0])
    assert len(_detect(db_session, field)) == 1

    # Next day the forecast moves the frost one day earlier, to day +2.
    tomorrow = TODAY + timedelta(days=1)
    _store(db_session, tomorrow, [3.0, -1.5, 1.0, 2.0], today=tomorrow)

    assert _detect(db_session, field, tomorrow) == []


def test_heat_warning(db_session: Session, field: Field, growing: None) -> None:
    upsert_days(
        db_session,
        CELL,
        [
            DailyWeather(day=TODAY + timedelta(days=i), t_max=t, t_min=25.0, precipitation=0.0, et0=8.0, wind_max=3.0)
            for i, t in enumerate([38.0, 41.0, 43.5, 39.0])
        ],
        TODAY,
    )

    assert _detect(db_session, field) == [("heat", TODAY + timedelta(days=1), TODAY + timedelta(days=2), 43.5)]


# --- summary and texts ---


def test_summary_before_excludes_the_day(db_session: Session) -> None:
    _store(db_session, TODAY - timedelta(days=7), [10.0] * 8, t_max=31.0)

    summary = summary_before(db_session, CELL, TODAY)

    assert summary is not None
    assert (summary.days, summary.precipitation, summary.et0, summary.t_max) == (7, 7.0, 21.0, 31.0)
    assert summary.balance == -14.0


def test_weather_texts() -> None:
    frost = messages.frost_alert("Paxta-1", date(2026, 10, 22), date(2026, 10, 23), -2.5, 0.0)
    heat = messages.heat_alert("Paxta-1", date(2026, 7, 10), date(2026, 7, 10), 43.5, 40.0)
    context = messages.weather_context(7, 0.0, 48.2, 41.0)

    assert "Sovuq xavfi: «Paxta-1»" in frost and "22.10.2026–23.10.2026: kechasi -2.5 °C" in frost
    assert "Jazirama: «Paxta-1»" in heat and "10.07.2026: kunduzi 43.5 °C" in heat
    assert context == (
        "🌦 Oldingi 7 kun ob-havosi (taxminiy): yogʻin 0 mm, eng yuqori harorat 41 °C, bugʻlanish (ET0) 48 mm."
    )


# --- sending ---


def test_index_alert_has_weather_line(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    save_observation(db_session, field.id, make_result(10, 0.75))
    observation = save_observation(db_session, field.id, make_result(18, 0.45))
    detect_drop(db_session, observation, 0.15)
    _store(db_session, date(2026, 10, 11), [12.0] * 7, t_max=33.0)
    outboxes = _fake_delivery(monkeypatch)

    notify.send_pending_alerts(db_session)

    [(_, text)] = outboxes[0]
    assert "NDVI keskin tushdi" in text
    assert "Oldingi 7 kun ob-havosi (taxminiy): yogʻin 7 mm, eng yuqori harorat 33 °C" in text


def test_weather_alert_is_sent_once(
    db_session: Session, field: Field, growing: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _store(db_session, TODAY, [4.0, -1.0, 2.0, 2.0])
    detect_for_field(db_session, field, TODAY, get_settings())
    monkeypatch.setattr(notify, "local_today", lambda settings=None: TODAY)
    outboxes = _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 1
    [(chat_id, text)] = outboxes[0]
    assert chat_id == TELEGRAM_USER_ID and "Sovuq xavfi" in text
    assert pending_weather_alerts(db_session) == []


def test_old_weather_alert_is_not_sent(
    db_session: Session, field: Field, growing: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _store(db_session, TODAY, [4.0, -1.0, 2.0, 2.0])
    detect_for_field(db_session, field, TODAY, get_settings())
    monkeypatch.setattr(notify, "local_today", lambda settings=None: TODAY + timedelta(days=5))
    outboxes = _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 0
    assert outboxes == []
    assert pending_weather_alerts(db_session) == []


def test_weather_alert_of_owner_without_telegram_is_marked_sent(
    db_session: Session, user: User, field: Field, growing: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    user.telegram_id = None
    db_session.commit()
    _store(db_session, TODAY, [4.0, -1.0, 2.0, 2.0])
    detect_for_field(db_session, field, TODAY, get_settings())
    monkeypatch.setattr(notify, "local_today", lambda settings=None: TODAY)
    _fake_delivery(monkeypatch)

    assert notify.send_pending_alerts(db_session) == 0
    assert pending_weather_alerts(db_session) == []
