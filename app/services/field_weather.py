"""Weather advice of one field for today. The weather endpoint and the Telegram alerts use it."""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Field
from app.services.history import latest_observation
from app.services.recommendations import IrrigationAdvice, forecast_rain, irrigation_advice, spray_day
from app.services.weather import WeatherSummary, field_cell, list_days, summary_before
from app.services.weather_alerts import is_growing


@dataclass(frozen=True)
class FieldWeatherAdvice:
    summary: WeatherSummary | None
    # The advice is empty for a field without growing plants: watering or spraying bare soil is not useful.
    # has_forecast is false then too, or when no forecast is stored.
    irrigation: IrrigationAdvice | None
    has_forecast: bool
    spray_day: date | None


def weather_advice(db: Session, field: Field, today: date, settings: Settings) -> FieldWeatherAdvice:
    cell = field_cell(field)
    summary = summary_before(db, cell, today)
    if not is_growing(db, field.id, today, settings):
        return FieldWeatherAdvice(summary=summary, irrigation=None, has_forecast=False, spray_day=None)

    forecast = list_days(db, cell, today, today + timedelta(days=settings.weather_forecast_days - 1))
    latest = latest_observation(db, field.id)
    ndmi = latest.ndmi_mean if latest is not None else None
    return FieldWeatherAdvice(
        summary=summary,
        irrigation=irrigation_advice(ndmi, summary, forecast_rain(forecast), settings),
        has_forecast=bool(forecast),
        spray_day=spray_day(forecast, settings),
    )
