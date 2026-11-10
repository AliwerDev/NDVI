"""Weather models: daily weather of one grid cell (Open-Meteo), and frost and heat warnings of a field."""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

WEATHER_FROST = "frost"
WEATHER_HEAT = "heat"
WEATHER_ALERT_KINDS = (WEATHER_FROST, WEATHER_HEAT)


class WeatherDay(Base):
    """One day of one grid cell. Fields near each other share a cell, so they share the rows.

    lat and lon are the cell center, rounded to 0.1 degree (see app.services.weather.grid_cell).
    is_forecast is true when the values came from a forecast, not from a past day.
    A later update replaces the forecast values with the values of the past day.
    """

    __tablename__ = "weather_daily"
    __table_args__ = (UniqueConstraint("lat", "lon", "day", name="uq_weather_daily_cell_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    day: Mapped[date] = mapped_column(Date)
    # Degrees Celsius
    t_max: Mapped[float | None] = mapped_column(Float)
    t_min: Mapped[float | None] = mapped_column(Float)
    # Millimeters per day: rain and snow water, and FAO-56 reference evapotranspiration
    precipitation: Mapped[float | None] = mapped_column(Float)
    et0: Mapped[float | None] = mapped_column(Float)
    # Meters per second, at 10 m
    wind_max: Mapped[float | None] = mapped_column(Float)
    is_forecast: Mapped[bool] = mapped_column(Boolean)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WeatherAlert(Base):
    """A frost or heat period in the forecast of a field. sent_at stays empty until the Telegram message is sent.

    day and last_day are the first and the last day of the period. value is the lowest minimum (frost)
    or the highest maximum (heat) temperature of the period, in degrees Celsius.
    """

    __tablename__ = "weather_alerts"
    __table_args__ = (UniqueConstraint("field_id", "kind", "day", name="uq_weather_alerts_field_kind_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    day: Mapped[date] = mapped_column(Date)
    last_day: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
