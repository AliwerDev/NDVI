"""Frost and heat warnings from the stored forecast. The website and the Telegram bot use the same rules."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Field, NdviObservation, WeatherAlert, WeatherDay
from app.models.weather import WEATHER_ALERT_KINDS, WEATHER_FROST
from app.services.weather import field_cell, list_days


def is_growing(db: Session, field_id: int, today: date, settings: Settings) -> bool:
    """True if a recent observation of the field shows plants: mean NDVI at or above NDRE_MIN_NDVI."""
    since = today - timedelta(days=settings.growing_lookback_days)
    return (
        db.scalar(
            select(NdviObservation.id)
            .where(
                NdviObservation.field_id == field_id,
                NdviObservation.observed_on >= since,
                NdviObservation.ndvi_mean >= settings.ndre_min_ndvi,
            )
            .limit(1)
        )
        is not None
    )


def _hit(day: WeatherDay, kind: str, settings: Settings) -> bool:
    if kind == WEATHER_FROST:
        return day.t_min is not None and day.t_min <= settings.frost_threshold_c
    return day.t_max is not None and day.t_max >= settings.heat_threshold_c


def _value(day: WeatherDay, kind: str) -> float:
    value = day.t_min if kind == WEATHER_FROST else day.t_max
    assert value is not None
    return value


def first_new_period(days: list[WeatherDay], kind: str, settings: Settings, first_day: date) -> list[WeatherDay]:
    """The first run of frost (or heat) days that starts on or after first_day.

    A run that already started before first_day is not new: its warning went out on an earlier day.
    """
    period: list[WeatherDay] = []
    previous_hit = False
    for day in days:
        hit = _hit(day, kind, settings)
        if period:
            if not hit:
                break
            period.append(day)
        elif hit and not previous_hit and day.day >= first_day:
            period.append(day)
        previous_hit = hit
    return period


def _overlaps_stored(db: Session, field_id: int, kind: str, first: date, last: date) -> bool:
    """True if a stored warning of the same kind touches [first, last]. A forecast often moves a period by a day."""
    return (
        db.scalar(
            select(WeatherAlert.id).where(
                WeatherAlert.field_id == field_id,
                WeatherAlert.kind == kind,
                WeatherAlert.day <= last + timedelta(days=1),
                WeatherAlert.last_day >= first - timedelta(days=1),
            )
        )
        is not None
    )


def detect_for_field(db: Session, field: Field, today: date, settings: Settings) -> list[WeatherAlert]:
    """Store a warning for each new frost or heat period in the next WEATHER_ALERT_DAYS days."""
    if not is_growing(db, field.id, today, settings):
        return []
    # Today is read too: it tells if a period that continues tomorrow is new.
    days = list_days(db, field_cell(field), today, today + timedelta(days=settings.weather_alert_days))
    found: list[WeatherAlert] = []
    for kind in WEATHER_ALERT_KINDS:
        period = first_new_period(days, kind, settings, today + timedelta(days=1))
        if not period:
            continue
        first, last = period[0].day, period[-1].day
        if _overlaps_stored(db, field.id, kind, first, last):
            continue
        values = [_value(d, kind) for d in period]
        alert = WeatherAlert(
            field_id=field.id,
            kind=kind,
            day=first,
            last_day=last,
            value=min(values) if kind == WEATHER_FROST else max(values),
        )
        db.add(alert)
        db.commit()
        found.append(alert)
    return found


def detect_weather_alerts(db: Session, fields: list[Field], today: date, settings: Settings) -> list[WeatherAlert]:
    """Run detect_for_field for every field. Returns the new warnings."""
    return [alert for field in fields for alert in detect_for_field(db, field, today, settings)]


def pending_weather_alerts(db: Session) -> list[WeatherAlert]:
    """Return warnings that are not sent yet, oldest first."""
    return list(db.scalars(select(WeatherAlert).where(WeatherAlert.sent_at.is_(None)).order_by(WeatherAlert.id)))
