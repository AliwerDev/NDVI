"""Weather endpoint: the daily weather of a field, past days and forecast."""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.api.fields import get_field_or_404
from app.config import get_settings
from app.schemas.weather import FieldWeatherRead, IrrigationAdviceRead, WeatherDayRead, WeatherSummaryRead
from app.services.field_weather import weather_advice
from app.services.weather import WeatherError, fetch_forecast, field_cell, has_day, list_days, local_today, upsert_days

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fields", tags=["weather"])

DEFAULT_PAST_DAYS = 30


@router.get("/{field_id}/weather")
def get_field_weather(
    field_id: int, user: CurrentUser, db: DbSession, start: date | None = None, end: date | None = None
) -> FieldWeatherRead:
    """Return the stored daily weather of the field in [start, end], and the advice for today.

    Without dates: the last 30 days and the forecast days. A new field gets its forecast on the first request,
    before the next daily update. The advice does not depend on start and end.
    """
    settings = get_settings()
    today = local_today(settings)
    start = start or today - timedelta(days=DEFAULT_PAST_DAYS)
    end = end or today + timedelta(days=settings.weather_forecast_days - 1)
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end"
        )
    field = get_field_or_404(db, field_id, user)
    cell = field_cell(field)

    if not has_day(db, cell, today):
        try:
            upsert_days(db, cell, fetch_forecast(cell, settings), today)
        except WeatherError:
            # The stored days are still useful, so the request does not fail.
            logger.warning("Weather for cell %s: forecast request failed", cell, exc_info=True)

    days = list_days(db, cell, start, end)
    advice = weather_advice(db, field, today, settings)
    return FieldWeatherRead(
        lat=cell[0],
        lon=cell[1],
        days=[WeatherDayRead.model_validate(d) for d in days],
        summary_7d=WeatherSummaryRead.model_validate(advice.summary) if advice.summary is not None else None,
        irrigation_advice=(
            IrrigationAdviceRead.model_validate(advice.irrigation) if advice.irrigation is not None else None
        ),
        spray_day=advice.spray_day,
    )
