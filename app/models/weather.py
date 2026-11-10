"""WeatherDay model: daily weather of one grid cell (Open-Meteo)."""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


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
