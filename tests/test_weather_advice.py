"""Tests for the irrigation advice, the spray day, and where they appear (endpoint, Telegram)."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.bot import messages, notify
from app.bot.subscriptions import user_weather
from app.config import get_settings
from app.models import Field, WeatherDay
from app.services.alerts import detect_alerts
from app.services.history import save_observation
from app.services.recommendations import irrigation_advice, spray_day
from app.services.weather import DailyWeather, WeatherSummary, upsert_days
from tests.conftest import TELEGRAM_USER_ID
from tests.factories import make_result
from tests.test_bot import _fake_delivery

TODAY = date(2026, 10, 20)
CELL = (41.3, 69.2)
SETTINGS = get_settings()


def _summary(precipitation: float, et0: float) -> WeatherSummary:
    return WeatherSummary(days=7, precipitation=precipitation, et0=et0, t_max=35.0)


# --- irrigation ---


def test_no_advice_without_weather() -> None:
    assert irrigation_advice(0.1, None, 0.0, SETTINGS) is None


def test_small_deficit_needs_no_watering() -> None:
    advice = irrigation_advice(0.1, _summary(precipitation=12.0, et0=20.0), 0.0, SETTINGS)

    assert advice is not None and advice.level == "ok"
    assert advice.deficit_mm == 8.0
    assert "shart emas" in advice.text


def test_large_deficit_needs_watering() -> None:
    advice = irrigation_advice(0.1, _summary(precipitation=0.0, et0=48.0), 2.0, SETTINGS)

    assert advice is not None and advice.level == "needed"
    assert advice.text == (
        "Oxirgi 7 kunda bugʻlanish (ET0) 48 mm, yogʻin 0 mm. Tuproq taxminan 48 mm suv yoʻqotdi. Sugʻorishni rejalang."
    )


def test_dry_leaves_need_watering_even_with_small_deficit() -> None:
    advice = irrigation_advice(-0.05, _summary(precipitation=10.0, et0=15.0), 0.0, SETTINGS)

    assert advice is not None and advice.level == "needed"
    assert "Barglar namligi ham past (NDMI)" in advice.text


def test_coming_rain_lets_the_farmer_wait() -> None:
    advice = irrigation_advice(0.1, _summary(precipitation=0.0, et0=40.0), 14.0, SETTINGS)

    assert advice is not None and advice.level == "wait_rain"
    assert "Keyingi 3 kunda 14 mm yogʻin kutilmoqda" in advice.text


# --- spray day ---


def _forecast(*values: tuple[float | None, float | None]) -> list[WeatherDay]:
    """(precipitation, wind_max) per day from TODAY."""
    return [
        WeatherDay(day=TODAY + timedelta(days=i), precipitation=rain, wind_max=wind)
        for i, (rain, wind) in enumerate(values)
    ]


def test_spray_day_is_first_dry_calm_day() -> None:
    days = _forecast((6.0, 2.0), (0.0, 7.5), (None, 2.0), (0.2, 3.1), (0.0, 1.0))

    assert spray_day(days, SETTINGS) == TODAY + timedelta(days=3)


def test_no_spray_day_in_rainy_windy_week() -> None:
    assert spray_day(_forecast((5.0, 2.0), (0.0, 9.0)), SETTINGS) is None


def test_heat_day_is_not_a_spray_day() -> None:
    days = _forecast((0.0, 2.0), (0.0, 2.0))
    days[0].t_max = 42.0

    assert spray_day(days, SETTINGS) == TODAY + timedelta(days=1)


# --- endpoint and Telegram ---


def _store_weather(db: Session) -> None:
    """A dry, hot past week, and a forecast: rain tomorrow, then a calm dry day."""
    past = [
        DailyWeather(day=TODAY - timedelta(days=7 - i), t_max=36.0, t_min=20.0, precipitation=0.0, et0=7.0, wind_max=3.0)
        for i in range(7)
    ]
    forecast = [
        DailyWeather(day=TODAY, t_max=30.0, t_min=18.0, precipitation=0.0, et0=6.0, wind_max=8.0),
        DailyWeather(day=TODAY + timedelta(days=1), t_max=25.0, t_min=15.0, precipitation=4.0, et0=3.0, wind_max=4.0),
        DailyWeather(day=TODAY + timedelta(days=2), t_max=27.0, t_min=14.0, precipitation=0.0, et0=5.0, wind_max=2.5),
    ]
    upsert_days(db, CELL, past + forecast, TODAY)


@pytest.fixture
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.weather.local_today", lambda settings=None: TODAY)
    monkeypatch.setattr(notify, "local_today", lambda settings=None: TODAY)


def test_endpoint_returns_advice_for_growing_field(
    db_client: TestClient, db_session: Session, field: Field, fixed_today: None
) -> None:
    save_observation(db_session, field.id, make_result(18, 0.6, ndmi=0.05))
    _store_weather(db_session)

    body = db_client.get(f"/fields/{field.id}/weather").json()

    assert body["summary_7d"] == {"days": 7, "precipitation": 0.0, "et0": 49.0, "t_max": 36.0, "balance": -49.0}
    assert body["irrigation_advice"]["level"] == "needed"
    assert body["spray_day"] == "2026-10-22"


def test_endpoint_has_no_advice_for_bare_field(
    db_client: TestClient, db_session: Session, field: Field, fixed_today: None
) -> None:
    _store_weather(db_session)

    body = db_client.get(f"/fields/{field.id}/weather").json()

    assert body["summary_7d"]["days"] == 7
    assert body["irrigation_advice"] is None
    assert body["spray_day"] is None


def test_water_and_nitrogen_alerts_get_advice(
    db_session: Session, field: Field, fixed_today: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    save_observation(db_session, field.id, make_result(10, 0.62, ndmi=0.04, ndre=0.25))
    observation = save_observation(db_session, field.id, make_result(18, 0.62, ndmi=-0.05, ndre=0.18))
    detect_alerts(db_session, observation, SETTINGS)
    _store_weather(db_session)
    outboxes = _fake_delivery(monkeypatch)

    notify.send_pending_alerts(db_session)

    texts = [text for _, text in outboxes[0]]
    [water] = [t for t in texts if "Suv stressi" in t]
    [nitrogen] = [t for t in texts if "Azot tavsiyasi" in t]
    assert "💧 Sugʻorish: Oxirgi 7 kunda bugʻlanish (ET0) 49 mm" in water
    assert "🧴 Purkash va oʻgʻitlash uchun qulay kun: 22.10.2026" in nitrogen


# --- /weather command ---


def test_weather_command_shows_forecast_and_advice(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(18, 0.6, ndmi=0.05))
    _store_weather(db_session)

    [text] = user_weather(db_session, TELEGRAM_USER_ID, TODAY)

    assert "🌦 «Paxta-1» ob-havosi" in text
    assert "Bugun, 20.10: 18…30 °C, yogʻin 0 mm, shamol 8 m/s" in text
    assert "Ertaga, 21.10: 15…25 °C, yogʻin 4 mm, shamol 4 m/s" in text
    assert "22.10: 14…27 °C" in text
    assert "💧 Sugʻorish:" in text
    assert "🧴 Purkash va oʻgʻitlash uchun qulay kun: 22.10.2026" in text


def test_weather_command_has_no_advice_for_bare_field(db_session: Session, field: Field) -> None:
    _store_weather(db_session)

    [text] = user_weather(db_session, TELEGRAM_USER_ID, TODAY)

    assert "Bugun, 20.10" in text
    assert "Sugʻorish" not in text and "Purkash" not in text


def test_weather_command_without_forecast(db_session: Session, field: Field) -> None:
    # Open-Meteo is offline in tests, so the command can only report that there is no forecast.
    [text] = user_weather(db_session, TELEGRAM_USER_ID, TODAY)

    assert messages.NO_FORECAST in text


def test_weather_command_without_account(db_session: Session) -> None:
    assert user_weather(db_session, 42, TODAY) == [messages.NO_FIELDS]


def test_forecast_day_marks_frost_and_heat() -> None:
    frost = messages.forecast_day_line(TODAY + timedelta(days=3), TODAY, -2.0, 8.0, 0.0, 3.0, 0.0, 40.0)
    heat = messages.forecast_day_line(TODAY, TODAY, 25.0, 42.0, None, None, 0.0, 40.0)

    assert frost == "23.10: -2…8 °C, yogʻin 0 mm, shamol 3 m/s ❄️ sovuq"
    assert heat == "Bugun, 20.10: 25…42 °C 🔥 jazirama"


def test_long_weather_reply_is_split() -> None:
    blocks = ["a" * 3000, "b" * 1000, "c" * 100]

    parts = messages.split_messages(blocks)

    assert parts == ["a" * 3000 + "\n\n" + "b" * 1000, "c" * 100]
    assert all(len(p) <= messages.MESSAGE_LIMIT for p in parts)
