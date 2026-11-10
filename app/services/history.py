"""Store and read observations (NDVI, NDMI, NDRE)."""

from collections.abc import Callable
from datetime import date

from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Field, NdviObservation
from app.services.ndvi import FieldNdvi, NdviStats, iter_field_ndvi_series


def _values(stats: NdviStats | None) -> tuple[float | None, float | None, float | None]:
    return (stats.mean, stats.min, stats.max) if stats is not None else (None, None, None)


def save_observation(db: Session, field_id: int, result: FieldNdvi) -> NdviObservation:
    """Insert the observation, or update it if the field already has one for that date."""
    if result.stats.mean is None or result.stats.min is None or result.stats.max is None:
        raise ValueError("Cannot save an observation without clear pixels")

    observed_on = result.scene.datetime.date()
    observation = db.scalar(
        select(NdviObservation).where(
            NdviObservation.field_id == field_id, NdviObservation.observed_on == observed_on
        )
    )
    if observation is None:
        observation = NdviObservation(field_id=field_id, observed_on=observed_on)
        db.add(observation)

    observation.scene_id = result.scene.id
    observation.scene_cloud_cover = result.scene.cloud_cover
    observation.ndvi_mean = result.stats.mean
    observation.ndvi_min = result.stats.min
    observation.ndvi_max = result.stats.max
    observation.ndmi_mean, observation.ndmi_min, observation.ndmi_max = _values(result.indices.get("ndmi"))
    observation.ndre_mean, observation.ndre_min, observation.ndre_max = _values(result.indices.get("ndre"))
    observation.clear_fraction = result.stats.clear_fraction
    observation.cog_path = result.cog_path
    db.commit()
    db.refresh(observation)
    return observation


def list_observations(
    db: Session, field_id: int, start: date | None = None, end: date | None = None
) -> list[NdviObservation]:
    """Return the observations of a field in date order, optionally limited to [start, end]."""
    query = select(NdviObservation).where(NdviObservation.field_id == field_id)
    if start is not None:
        query = query.where(NdviObservation.observed_on >= start)
    if end is not None:
        query = query.where(NdviObservation.observed_on <= end)
    return list(db.scalars(query.order_by(NdviObservation.observed_on)))


def latest_observation(db: Session, field_id: int) -> NdviObservation | None:
    """Return the newest observation of a field, or None."""
    return db.scalar(
        select(NdviObservation)
        .where(NdviObservation.field_id == field_id)
        .order_by(NdviObservation.observed_on.desc())
        .limit(1)
    )


def backfill_field(
    db: Session,
    field: Field,
    start: date,
    end: date,
    on_saved: Callable[[NdviObservation], None] | None = None,
) -> list[NdviObservation]:
    """Compute and store NDVI for all clear scenes of the field in [start, end].

    Each observation is saved as soon as it is computed, so the history grows while the job runs.
    """
    observations: list[NdviObservation] = []
    for result in iter_field_ndvi_series(field.id, to_shape(field.geometry), start, end):
        observation = save_observation(db, field.id, result)
        observations.append(observation)
        if on_saved is not None:
            on_saved(observation)
    return observations


def previous_observation(db: Session, field_id: int, before: date) -> NdviObservation | None:
    """Return the newest observation of a field that is older than the given date, or None."""
    return db.scalar(
        select(NdviObservation)
        .where(NdviObservation.field_id == field_id, NdviObservation.observed_on < before)
        .order_by(NdviObservation.observed_on.desc())
        .limit(1)
    )
