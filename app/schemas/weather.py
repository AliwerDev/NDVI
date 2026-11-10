"""Pydantic schemas for the daily weather of a field."""

from datetime import date

from pydantic import BaseModel, ConfigDict


class WeatherDayRead(BaseModel):
    """One day. Temperatures in °C, precipitation and ET0 in mm, wind in m/s. Open-Meteo can leave a value empty."""

    model_config = ConfigDict(from_attributes=True)

    day: date
    t_max: float | None
    t_min: float | None
    precipitation: float | None
    et0: float | None
    wind_max: float | None
    is_forecast: bool


class FieldWeatherRead(BaseModel):
    """The weather of the grid cell of a field. The page must show the source (CC BY 4.0)."""

    lat: float
    lon: float
    source: str = "Open-Meteo.com"
    days: list[WeatherDayRead]
