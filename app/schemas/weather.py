"""Pydantic schemas for the daily weather of a field."""

from datetime import date
from typing import Literal

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


class WeatherSummaryRead(BaseModel):
    """Totals of the days before today. balance = precipitation - et0, in mm."""

    model_config = ConfigDict(from_attributes=True)

    days: int
    precipitation: float
    et0: float
    t_max: float | None
    balance: float


class IrrigationAdviceRead(BaseModel):
    """level "needed": plan the watering, "wait_rain": rain comes soon, "ok": no extra watering now."""

    model_config = ConfigDict(from_attributes=True)

    level: Literal["needed", "wait_rain", "ok"]
    text: str
    deficit_mm: float
    forecast_rain_mm: float


class FieldWeatherRead(BaseModel):
    """The weather of the grid cell of a field. The page must show the source (CC BY 4.0).

    irrigation_advice and spray_day are null for a field without growing plants.
    """

    lat: float
    lon: float
    source: str = "Open-Meteo.com"
    days: list[WeatherDayRead]
    summary_7d: WeatherSummaryRead | None
    irrigation_advice: IrrigationAdviceRead | None
    spray_day: date | None
