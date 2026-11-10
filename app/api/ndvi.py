"""NDVI endpoints: compute one observation, read the history, and backfill the history."""

import logging
from datetime import date

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from geoalchemy2.shape import to_shape
from pystac_client.exceptions import APIError
from rasterio.errors import RasterioIOError

from app.api.deps import CurrentUser, DbSession
from app.api.fields import get_field_or_404
from app.db import SessionLocal
from app.models import BackfillJob
from app.schemas.ndvi import BackfillJobRead, ObservationRead
from app.services.backfill import BackfillAlreadyRunningError, latest_job, run_job, start_job, status_of
from app.services.history import list_observations, save_observation
from app.services.ndvi import NoClearSceneError, compute_field_ndvi

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fields", tags=["ndvi"])


def _check_date_range(start: date | None, end: date | None) -> None:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end"
        )


@router.post("/{field_id}/ndvi")
def create_field_ndvi(field_id: int, start: date, end: date, user: CurrentUser, db: DbSession) -> ObservationRead:
    """Compute NDVI for the newest clear scene in [start, end], save a COG and store the observation."""
    _check_date_range(start, end)
    field = get_field_or_404(db, field_id, user)

    try:
        result = compute_field_ndvi(field.id, to_shape(field.geometry), start, end)
    except NoClearSceneError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"STAC API error: {exc}"
        ) from exc
    except RasterioIOError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not read satellite data: {exc}"
        ) from exc

    observation = save_observation(db, field.id, result)
    return ObservationRead.model_validate(observation)


@router.get("/{field_id}/ndvi")
def get_field_ndvi_history(
    field_id: int, user: CurrentUser, db: DbSession, start: date | None = None, end: date | None = None
) -> list[ObservationRead]:
    """Return the NDVI time series of the field in date order."""
    _check_date_range(start, end)
    get_field_or_404(db, field_id, user)
    return [ObservationRead.model_validate(o) for o in list_observations(db, field_id, start, end)]


def run_backfill(job_id: int) -> None:
    """Background job. It uses its own session, because the request session closes after the response."""
    with SessionLocal() as db:
        run_job(db, job_id)


def _job_read(job: BackfillJob) -> BackfillJobRead:
    return BackfillJobRead.model_validate(job).model_copy(update={"status": status_of(job)})


@router.post("/{field_id}/ndvi/backfill", status_code=status.HTTP_202_ACCEPTED)
def start_backfill(
    field_id: int, start: date, end: date, user: CurrentUser, db: DbSession, background_tasks: BackgroundTasks
) -> BackfillJobRead:
    """Start filling the NDVI history for [start, end] in the background. Poll GET for the progress."""
    _check_date_range(start, end)
    get_field_or_404(db, field_id, user)
    try:
        job = start_job(db, field_id, start, end)
    except BackfillAlreadyRunningError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A backfill is already running for this field"
        ) from exc
    background_tasks.add_task(run_backfill, job.id)
    return _job_read(job)


@router.get("/{field_id}/ndvi/backfill")
def get_backfill(field_id: int, user: CurrentUser, db: DbSession) -> BackfillJobRead | None:
    """Return the newest backfill job of the field, or null if it never had one."""
    get_field_or_404(db, field_id, user)
    job = latest_job(db, field_id)
    return _job_read(job) if job is not None else None
