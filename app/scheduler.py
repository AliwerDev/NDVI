"""Periodic job: update the weather and the indices of all fields, detect problems, send Telegram alerts.

Run every day:  python -m app.scheduler
Run once now:   python -m app.scheduler --once
"""

import argparse
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from geoalchemy2.shape import to_shape
from pystac_client.exceptions import APIError
from rasterio.errors import RasterioIOError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot.notify import send_pending_alerts
from app.config import get_settings
from app.db import SessionLocal
from app.models import Field, NdviObservation
from app.services.alerts import detect_alerts
from app.services.history import latest_observation, save_observation
from app.services.ndvi import NoClearSceneError, compute_field_ndvi
from app.services.weather import refresh_forecasts

logger = logging.getLogger(__name__)


def update_field(db: Session, field: Field, today: date) -> NdviObservation | None:
    """Compute NDVI for the newest clear scene after the last observation. Returns the new observation or None."""
    latest = latest_observation(db, field.id)
    if latest is not None:
        start = latest.observed_on + timedelta(days=1)
    else:
        start = today - timedelta(days=get_settings().scheduler_lookback_days)
    if start > today:
        return None

    try:
        result = compute_field_ndvi(field.id, to_shape(field.geometry), start, today)
    except NoClearSceneError:
        logger.info("Field %s: no new clear scene since %s", field.id, start)
        return None
    return save_observation(db, field.id, result)


def run_update(db: Session, today: date) -> None:
    """Update every field, create alerts for sharp drops, and send pending alerts."""
    settings = get_settings()
    fields = list(db.scalars(select(Field).order_by(Field.id)))
    logger.info("Updating %d fields for %s", len(fields), today)
    cells = refresh_forecasts(db, fields, today)
    logger.info("Weather updated for %d grid cells", cells)

    for field in fields:
        try:
            observation = update_field(db, field, today)
        except (APIError, RasterioIOError):
            # One broken field or a short network problem must not stop the other fields.
            logger.exception("Field %s: update failed", field.id)
            db.rollback()
            continue
        if observation is None:
            continue
        logger.info("Field %s: NDVI %.3f on %s", field.id, observation.ndvi_mean, observation.observed_on)
        for alert in detect_alerts(db, observation, settings):
            logger.warning("Field %s: %s alert, value %.3f", field.id, alert.kind, alert.current_mean)

    sent = send_pending_alerts(db)
    logger.info("Update finished, %d Telegram messages sent", sent)


def run_update_job() -> None:
    """Entry point for APScheduler: opens its own database session."""
    tz = ZoneInfo(get_settings().scheduler_timezone)
    with SessionLocal() as db:
        run_update(db, datetime.now(tz).date())


def main() -> None:
    parser = argparse.ArgumentParser(description="NDVI update scheduler")
    parser.add_argument("--once", action="store_true", help="run the update one time and exit")
    args = parser.parse_args()

    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    if args.once:
        run_update_job()
        return

    scheduler = BlockingScheduler(timezone=settings.scheduler_timezone)
    scheduler.add_job(
        run_update_job,
        CronTrigger(
            hour=settings.scheduler_hour,
            minute=settings.scheduler_minute,
            timezone=settings.scheduler_timezone,
        ),
        id="ndvi_update",
        # If the job is late (for example after a restart), still run it within one hour.
        misfire_grace_time=3600,
        coalesce=True,
    )
    logger.info(
        "Scheduler started: every day at %02d:%02d %s",
        settings.scheduler_hour,
        settings.scheduler_minute,
        settings.scheduler_timezone,
    )
    scheduler.start()


if __name__ == "__main__":
    main()
