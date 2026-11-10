"""Tests for the weather service, its use in the scheduler and the backfill, and the endpoint. HTTP is faked."""

from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from geoalchemy2.shape import from_shape
from shapely.geometry import box
from sqlalchemy.orm import Session

from app import scheduler
from app.models import Field, User
from app.services import history, weather
from app.services.backfill import run_job, start_job
from app.services.weather import (
    DailyWeather,
    WeatherError,
    fill_history,
    grid_cell,
    list_days,
    parse_daily,
    refresh_forecasts,
    upsert_days,
)

# The real function. The autouse fixture in conftest.py replaces it with an offline one.
REAL_GET_JSON = weather._get_json

TODAY = date(2026, 10, 20)
CELL = (41.3, 69.2)


def _payload(start: date, count: int, t_max: float = 25.0, precipitation: float = 0.0) -> dict[str, Any]:
    """An Open-Meteo answer with `count` days from `start`, the same values every day."""
    return {
        "daily": {
            "time": [(start + timedelta(days=i)).isoformat() for i in range(count)],
            "temperature_2m_max": [t_max] * count,
            "temperature_2m_min": [t_max - 12] * count,
            "precipitation_sum": [precipitation] * count,
            "et0_fao_evapotranspiration": [4.5] * count,
            "wind_speed_10m_max": [3.0] * count,
        }
    }


class FakeOpenMeteo:
    """Records the requests and returns the prepared answer."""

    def __init__(self, answer: dict[str, Any] | Exception) -> None:
        self.answer = answer
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __call__(self, url: str, params: dict[str, Any], timeout: float) -> dict[str, Any]:
        self.calls.append((url, params))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def _day(day: date, t_max: float | None = 25.0, precipitation: float | None = 0.0) -> DailyWeather:
    return DailyWeather(day=day, t_max=t_max, t_min=10.0, precipitation=precipitation, et0=4.0, wind_max=3.0)


# --- parsing and requests ---


def test_grid_cell_rounds_the_centroid() -> None:
    assert grid_cell(box(69.26, 41.33, 69.28, 41.35)) == (41.3, 69.3)


def test_parse_daily_maps_variables_and_fills_missing_ones() -> None:
    payload = _payload(TODAY, 2)
    del payload["daily"]["wind_speed_10m_max"]

    days = parse_daily(payload)

    assert [d.day for d in days] == [TODAY, TODAY + timedelta(days=1)]
    assert days[0].t_max == 25.0 and days[0].t_min == 13.0 and days[0].et0 == 4.5
    assert days[0].wind_max is None


def test_parse_daily_without_daily_block_fails() -> None:
    with pytest.raises(WeatherError):
        parse_daily({"error": True, "reason": "bad"})


def test_fetch_forecast_sends_cell_and_units(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeOpenMeteo(_payload(TODAY, 3))
    monkeypatch.setattr(weather, "_get_json", fake)

    weather.fetch_forecast(CELL)

    url, params = fake.calls[0]
    assert url.endswith("/v1/forecast")
    assert (params["latitude"], params["longitude"]) == CELL
    assert params["wind_speed_unit"] == "ms"
    assert params["timezone"] == "Asia/Tashkent"
    assert params["past_days"] == 7 and params["forecast_days"] == 7
    assert "et0_fao_evapotranspiration" in params["daily"]
    assert "apikey" not in params


def test_http_error_becomes_weather_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*args: Any, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(weather.httpx, "get", broken)

    with pytest.raises(WeatherError):
        REAL_GET_JSON("https://example.invalid", {}, 1.0)


# --- storage ---


def test_upsert_replaces_forecast_with_past_values(db_session: Session) -> None:
    day = TODAY + timedelta(days=1)
    upsert_days(db_session, CELL, [_day(day, t_max=30.0)], TODAY)
    upsert_days(db_session, CELL, [_day(day, t_max=33.0)], day + timedelta(days=1))

    [stored] = list_days(db_session, CELL, day, day)
    assert stored.t_max == 33.0
    assert stored.is_forecast is False


def test_upsert_skips_empty_days_and_marks_today_as_forecast(db_session: Session) -> None:
    yesterday = TODAY - timedelta(days=1)
    upsert_days(db_session, CELL, [_day(yesterday, precipitation=5.0)], TODAY)
    empty = DailyWeather(day=yesterday, t_max=None, t_min=None, precipitation=None, et0=None, wind_max=None)

    written = upsert_days(db_session, CELL, [empty, _day(TODAY)], TODAY)

    assert written == 1
    stored = list_days(db_session, CELL, yesterday, TODAY)
    assert [(d.day, d.precipitation, d.is_forecast) for d in stored] == [(yesterday, 5.0, False), (TODAY, 0.0, True)]


def test_refresh_fetches_each_cell_once(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    # A second field in the same grid cell
    neighbour = Field(owner_id=field.owner_id, name="Paxta-2", geometry=from_shape(box(69.21, 41.30, 69.22, 41.31), srid=4326))
    db_session.add(neighbour)
    db_session.commit()
    fake = FakeOpenMeteo(_payload(TODAY - timedelta(days=7), 14))
    monkeypatch.setattr(weather, "_get_json", fake)

    assert refresh_forecasts(db_session, [field, neighbour], TODAY) == 1
    assert len(fake.calls) == 1
    assert len(list_days(db_session, CELL, TODAY - timedelta(days=7), TODAY + timedelta(days=6))) == 14


def test_refresh_skips_failed_cell(db_session: Session, field: Field) -> None:
    # The autouse fixture makes every request fail.
    assert refresh_forecasts(db_session, [field], TODAY) == 0


def test_fill_history_stops_at_yesterday(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeOpenMeteo(_payload(date(2026, 10, 1), 19))
    monkeypatch.setattr(weather, "_get_json", fake)

    fill_history(db_session, field, date(2026, 10, 1), date(2026, 10, 31), TODAY)

    _, params = fake.calls[0]
    assert (params["start_date"], params["end_date"]) == ("2026-10-01", "2026-10-19")


def test_fill_history_of_future_range_does_nothing(db_session: Session, field: Field) -> None:
    assert fill_history(db_session, field, TODAY, TODAY + timedelta(days=5), TODAY) == 0


# --- scheduler and backfill ---


def test_run_update_stores_weather(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather, "_get_json", FakeOpenMeteo(_payload(TODAY - timedelta(days=7), 14)))
    monkeypatch.setattr(scheduler, "update_field", lambda db, field, today: None)
    monkeypatch.setattr(scheduler, "send_pending_alerts", lambda db: 0)

    scheduler.run_update(db_session, TODAY)

    assert len(list_days(db_session, CELL, TODAY - timedelta(days=7), TODAY + timedelta(days=6))) == 14


def test_backfill_stores_weather_history(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history, "iter_field_ndvi_series", lambda *args, **kwargs: iter([]))
    monkeypatch.setattr(weather, "_get_json", FakeOpenMeteo(_payload(date(2026, 10, 1), 10, precipitation=2.0)))
    monkeypatch.setattr("app.services.backfill.local_today", lambda: TODAY)
    job = start_job(db_session, field.id, date(2026, 10, 1), date(2026, 10, 10))

    run_job(db_session, job.id)

    db_session.refresh(job)
    assert job.status == "done"
    assert sum(d.precipitation or 0 for d in list_days(db_session, CELL, date(2026, 10, 1), TODAY)) == 20.0


def test_backfill_finishes_when_weather_fails(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history, "iter_field_ndvi_series", lambda *args, **kwargs: iter([]))
    job = start_job(db_session, field.id, date(2026, 10, 1), date(2026, 10, 10))

    run_job(db_session, job.id)

    db_session.refresh(job)
    assert job.status == "done"


# --- endpoint ---


@pytest.fixture
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.weather.local_today", lambda settings=None: TODAY)


def test_endpoint_fetches_forecast_for_new_cell(
    db_client: TestClient, field: Field, fixed_today: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeOpenMeteo(_payload(TODAY - timedelta(days=7), 14))
    monkeypatch.setattr(weather, "_get_json", fake)

    response = db_client.get(f"/fields/{field.id}/weather")
    again = db_client.get(f"/fields/{field.id}/weather")

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["lat"], body["lon"]) == CELL
    assert body["source"] == "Open-Meteo.com"
    assert len(body["days"]) == 14
    assert body["days"][-1]["is_forecast"] is True
    assert again.status_code == 200
    # The second request finds today in the database and does not call Open-Meteo.
    assert len(fake.calls) == 1


def test_endpoint_returns_stored_days_when_open_meteo_fails(
    db_client: TestClient, db_session: Session, field: Field, fixed_today: None
) -> None:
    upsert_days(db_session, CELL, [_day(TODAY - timedelta(days=1), precipitation=7.5)], TODAY)

    response = db_client.get(f"/fields/{field.id}/weather")

    assert response.status_code == 200
    assert [d["precipitation"] for d in response.json()["days"]] == [7.5]


def test_endpoint_hides_other_users_field(db_client: TestClient, db_session: Session, fixed_today: None) -> None:
    other = User(username="boshqa")
    db_session.add(other)
    db_session.commit()
    foreign = Field(owner_id=other.id, name="Begona", geometry=from_shape(box(69.20, 41.30, 69.21, 41.31), srid=4326))
    db_session.add(foreign)
    db_session.commit()

    assert db_client.get(f"/fields/{foreign.id}/weather").status_code == 404


def test_endpoint_rejects_reversed_range(db_client: TestClient, field: Field, fixed_today: None) -> None:
    response = db_client.get(f"/fields/{field.id}/weather?start=2026-10-10&end=2026-10-01")

    assert response.status_code == 422
