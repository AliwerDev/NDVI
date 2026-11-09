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
from app.models import Field
from app.schemas.ndvi import BackfillStarted, ObservationRead
from app.services.history import backfill_field, list_observations, save_observation
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


def run_backfill(field_id: int, start: date, end: date) -> None:
    """Background job. It uses its own session, because the request session closes after the response."""
    with SessionLocal() as db:
        field = db.get(Field, field_id)
        if field is None:
            return
        try:
            observations = backfill_field(db, field, start, end)
        except Exception:
            logger.exception("Backfill failed for field %s", field_id)
            return
        logger.info("Backfill for field %s saved %d observations", field_id, len(observations))


@router.post("/{field_id}/ndvi/backfill", status_code=status.HTTP_202_ACCEPTED)
def start_backfill(
    field_id: int, start: date, end: date, user: CurrentUser, db: DbSession, background_tasks: BackgroundTasks
) -> BackfillStarted:
    """Start filling the NDVI history for [start, end] in the background. Reload the history later."""
    _check_date_range(start, end)
    get_field_or_404(db, field_id, user)
    background_tasks.add_task(run_backfill, field_id, start, end)
    return BackfillStarted(field_id=field_id, start=start, end=end)
