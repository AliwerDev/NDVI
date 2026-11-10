"""Backfill jobs: start, read, and run the background fill of the NDVI history of a field."""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import BackfillJob, Field, NdviObservation
from app.models.backfill_job import STATUS_DONE, STATUS_FAILED, STATUS_RUNNING
from app.services.history import backfill_field

logger = logging.getLogger(__name__)

# A running job without a saved observation for this long is dead, for example after an API restart.
# One scene takes seconds, so a live job never comes close to this limit.
STALE_AFTER = timedelta(minutes=10)


class BackfillAlreadyRunningError(Exception):
    """The field already has a running backfill job."""


def is_stale(job: BackfillJob, now: datetime | None = None) -> bool:
    """True if the job says "running" but stopped making progress."""
    now = now or datetime.now(UTC)
    return job.status == STATUS_RUNNING and job.updated_at < now - STALE_AFTER


def status_of(job: BackfillJob) -> str:
    """The status to show: a stale running job counts as failed."""
    return STATUS_FAILED if is_stale(job) else job.status


def latest_job(db: Session, field_id: int) -> BackfillJob | None:
    """Return the newest backfill job of the field, or None."""
    return db.scalar(
        select(BackfillJob).where(BackfillJob.field_id == field_id).order_by(BackfillJob.id.desc()).limit(1)
    )


def start_job(db: Session, field_id: int, start: date, end: date) -> BackfillJob:
    """Store a new running job. Raise BackfillAlreadyRunningError if the field has a live one."""
    running = db.scalar(
        select(BackfillJob).where(BackfillJob.field_id == field_id, BackfillJob.status == STATUS_RUNNING)
    )
    if running is not None:
        if not is_stale(running):
            raise BackfillAlreadyRunningError
        _finish(db, running, STATUS_FAILED)

    job = BackfillJob(field_id=field_id, start=start, end=end, status=STATUS_RUNNING, saved_count=0)
    db.add(job)
    try:
        db.commit()
    except IntegrityError as exc:
        # Another request started a job for this field between the check and the insert.
        db.rollback()
        raise BackfillAlreadyRunningError from exc
    db.refresh(job)
    return job


def run_job(db: Session, job_id: int) -> None:
    """Fill the history for the job's date range and record the progress and the result."""
    job = db.get(BackfillJob, job_id)
    if job is None:
        return
    field = db.get(Field, job.field_id)
    if field is None:
        return

    def on_saved(_: NdviObservation) -> None:
        job.saved_count += 1
        job.updated_at = datetime.now(UTC)
        db.commit()

    try:
        backfill_field(db, field, job.start, job.end, on_saved=on_saved)
    except Exception:
        logger.exception("Backfill job %s failed for field %s", job_id, job.field_id)
        db.rollback()
        # The job is gone if the field was deleted while the job ran.
        failed_job = db.get(BackfillJob, job_id)
        if failed_job is not None:
            _finish(db, failed_job, STATUS_FAILED)
        return

    _finish(db, job, STATUS_DONE)
    logger.info("Backfill job %s for field %s saved %d observations", job_id, job.field_id, job.saved_count)


def _finish(db: Session, job: BackfillJob, status: str) -> None:
    now = datetime.now(UTC)
    job.status = status
    job.updated_at = now
    job.finished_at = now
    db.commit()
