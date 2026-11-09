"""Detect sharp NDVI drops and store them as alerts."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, NdviObservation
from app.services.history import previous_observation


def detect_drop(db: Session, observation: NdviObservation, threshold: float) -> Alert | None:
    """Create an alert if mean NDVI fell by at least `threshold` since the previous observation.

    Returns the alert (new or already stored), or None if there is no sharp drop.
    """
    previous = previous_observation(db, observation.field_id, observation.observed_on)
    if previous is None:
        return None

    # Round to avoid float noise: 0.70 - 0.55 must count as 0.15.
    drop = round(previous.ndvi_mean - observation.ndvi_mean, 4)
    if drop < threshold:
        return None

    existing = db.scalar(select(Alert).where(Alert.observation_id == observation.id))
    if existing is not None:
        return existing

    alert = Alert(
        field_id=observation.field_id,
        observation_id=observation.id,
        previous_observation_id=previous.id,
        previous_mean=previous.ndvi_mean,
        current_mean=observation.ndvi_mean,
        drop=drop,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def pending_alerts(db: Session) -> list[Alert]:
    """Return alerts that are not sent yet, oldest first."""
    return list(db.scalars(select(Alert).where(Alert.sent_at.is_(None)).order_by(Alert.id)))
