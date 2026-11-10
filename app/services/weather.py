"""Daily weather from Open-Meteo: fetch it for a grid cell, store it, and read it for a field.

The global weather models (ECMWF IFS, GFS, ICON) have a grid of about 9-13 km. Fields that are near each
other get the same values, so the weather is stored per grid cell of 0.1 degree, not per field.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from geoalchemy2.shape import to_shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Field, WeatherDay

logger = logging.getLogger(__name__)

Cell = tuple[float, float]

# Open-Meteo daily variable -> WeatherDay column
DAILY_VARIABLES = {
    "temperature_2m_max": "t_max",
    "temperature_2m_min": "t_min",
    "precipitation_sum": "precipitation",
    "et0_fao_evapotranspiration": "et0",
    "wind_speed_10m_max": "wind_max",
}
VALUE_COLUMNS = tuple(DAILY_VARIABLES.values())


class WeatherError(Exception):
    """Open-Meteo did not answer, or the answer has no daily data."""


@dataclass(frozen=True)
class DailyWeather:
    day: date
    t_max: float | None
    t_min: float | None
    precipitation: float | None
    et0: float | None
    wind_max: float | None

    def is_empty(self) -> bool:
        return all(getattr(self, name) is None for name in VALUE_COLUMNS)


def local_today(settings: Settings | None = None) -> date:
    """Today in the time zone of the fields. The Docker container runs in UTC."""
    settings = settings or get_settings()
    return datetime.now(ZoneInfo(settings.scheduler_timezone)).date()


def grid_cell(polygon: BaseGeometry) -> Cell:
    """The grid cell (lat, lon) of a field: its centroid rounded to 0.1 degree."""
    center = polygon.centroid
    return round(center.y, 1), round(center.x, 1)


def field_cell(field: Field) -> Cell:
    return grid_cell(to_shape(field.geometry))


def _get_json(url: str, params: dict[str, Any], timeout: float) -> dict[str, Any]:
    try:
        response = httpx.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherError(f"Open-Meteo request failed: {exc}") from exc


def _base_params(cell: Cell, settings: Settings) -> dict[str, Any]:
    params: dict[str, Any] = {
        "latitude": cell[0],
        "longitude": cell[1],
        "daily": ",".join(DAILY_VARIABLES),
        "wind_speed_unit": "ms",
        # Daily values must cover the local day, not the UTC day.
        "timezone": settings.scheduler_timezone,
    }
    if settings.open_meteo_api_key:
        params["apikey"] = settings.open_meteo_api_key
    return params


def parse_daily(payload: dict[str, Any]) -> list[DailyWeather]:
    """Convert the "daily" block of an Open-Meteo answer to rows. A missing variable gives None values."""
    daily = payload.get("daily")
    if not isinstance(daily, dict) or not isinstance(daily.get("time"), list):
        raise WeatherError("Open-Meteo answer has no daily data")
    times: list[str] = daily["time"]
    columns = {
        column: daily.get(variable) or [None] * len(times) for variable, column in DAILY_VARIABLES.items()
    }
    return [
        DailyWeather(day=date.fromisoformat(day), **{column: values[i] for column, values in columns.items()})
        for i, day in enumerate(times)
    ]


def fetch_forecast(cell: Cell, settings: Settings | None = None) -> list[DailyWeather]:
    """Recent past days and the forecast days of the cell."""
    settings = settings or get_settings()
    params = _base_params(cell, settings) | {
        "past_days": settings.weather_past_days,
        "forecast_days": settings.weather_forecast_days,
    }
    return parse_daily(_get_json(settings.open_meteo_url, params, settings.weather_timeout_seconds))


def fetch_archive(cell: Cell, start: date, end: date, settings: Settings | None = None) -> list[DailyWeather]:
    """Past days from the reanalysis archive (ERA5). The last few days are empty there."""
    settings = settings or get_settings()
    params = _base_params(cell, settings) | {"start_date": start.isoformat(), "end_date": end.isoformat()}
    return parse_daily(_get_json(settings.open_meteo_archive_url, params, settings.weather_timeout_seconds))


def upsert_days(db: Session, cell: Cell, days: list[DailyWeather], today: date) -> int:
    """Insert or replace the rows of the cell. Returns the number of rows written.

    Days without any value are skipped, so an empty archive day does not erase a forecast value.
    Today counts as a forecast day: the day is not over yet.
    """
    now = datetime.now(UTC)
    rows = [
        {
            "lat": cell[0],
            "lon": cell[1],
            "day": d.day,
            **{name: getattr(d, name) for name in VALUE_COLUMNS},
            "is_forecast": d.day >= today,
            "fetched_at": now,
        }
        for d in days
        if not d.is_empty()
    ]
    if not rows:
        return 0
    statement = insert(WeatherDay).values(rows)
    statement = statement.on_conflict_do_update(
        constraint="uq_weather_daily_cell_day",
        set_={name: statement.excluded[name] for name in (*VALUE_COLUMNS, "is_forecast", "fetched_at")},
    )
    db.execute(statement)
    db.commit()
    return len(rows)


def list_days(db: Session, cell: Cell, start: date, end: date) -> list[WeatherDay]:
    """Stored days of the cell in [start, end], in date order."""
    return list(
        db.scalars(
            select(WeatherDay)
            .where(WeatherDay.lat == cell[0], WeatherDay.lon == cell[1], WeatherDay.day.between(start, end))
            .order_by(WeatherDay.day)
        )
    )


def has_day(db: Session, cell: Cell, day: date) -> bool:
    return db.scalar(
        select(WeatherDay.id).where(WeatherDay.lat == cell[0], WeatherDay.lon == cell[1], WeatherDay.day == day)
    ) is not None


def refresh_forecasts(db: Session, fields: list[Field], today: date) -> int:
    """Fetch and store the forecast of every grid cell of the fields. Returns the number of updated cells.

    A failed cell is logged and skipped: the NDVI update must not stop because of the weather.
    """
    cells = sorted({field_cell(field) for field in fields})
    updated = 0
    for cell in cells:
        try:
            upsert_days(db, cell, fetch_forecast(cell), today)
        except WeatherError:
            logger.warning("Weather for cell %s: forecast update failed", cell, exc_info=True)
            continue
        updated += 1
    return updated


def fill_history(db: Session, field: Field, start: date, end: date, today: date) -> int:
    """Store the archive weather of the field for [start, end]. Returns the number of rows written.

    The archive has no future days, so the range stops at yesterday. The daily forecast update fills the rest.
    """
    end = min(end, today - timedelta(days=1))
    if start > end:
        return 0
    cell = field_cell(field)
    return upsert_days(db, cell, fetch_archive(cell, start, end), today)


@dataclass(frozen=True)
class WeatherSummary:
    """Totals of the stored days before a date. Empty values count as 0 mm."""

    days: int
    precipitation: float
    et0: float
    t_max: float | None

    @property
    def balance(self) -> float:
        """Rain minus reference evapotranspiration, in mm. A negative value means that the soil loses water."""
        return self.precipitation - self.et0


def summary_before(db: Session, cell: Cell, day: date, n: int = 7) -> WeatherSummary | None:
    """Totals of the n days before `day` (the day itself is not included), or None without stored days."""
    rows = list_days(db, cell, day - timedelta(days=n), day - timedelta(days=1))
    if not rows:
        return None
    maxima = [r.t_max for r in rows if r.t_max is not None]
    return WeatherSummary(
        days=len(rows),
        precipitation=round(sum(r.precipitation or 0.0 for r in rows), 1),
        et0=round(sum(r.et0 or 0.0 for r in rows), 1),
        t_max=max(maxima) if maxima else None,
    )
