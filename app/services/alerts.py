"""Find problems in new observations and store them as alerts: NDVI drop, water stress (NDMI), low nitrogen (NDRE)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Alert, NdviObservation
from app.models.alert import ALERT_NDMI_STRESS, ALERT_NDRE_LOW, ALERT_NDVI_DROP
from app.services.history import previous_observation
from app.services.recommendations import nitrogen_level


def _store(
    db: Session,
    kind: str,
    observation: NdviObservation,
    current_mean: float,
    previous: NdviObservation | None,
    previous_mean: float | None,
    drop: float | None,
) -> Alert:
    """Save the alert, or return the stored one: one alert of each kind per observation."""
    existing = db.scalar(select(Alert).where(Alert.observation_id == observation.id, Alert.kind == kind))
    if existing is not None:
        return existing

    alert = Alert(
        kind=kind,
        field_id=observation.field_id,
        observation_id=observation.id,
        previous_observation_id=previous.id if previous is not None else None,
        previous_mean=previous_mean,
        current_mean=current_mean,
        drop=drop,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


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
    return _store(db, ALERT_NDVI_DROP, observation, observation.ndvi_mean, previous, previous.ndvi_mean, drop)


def detect_ndmi_stress(
    db: Session, observation: NdviObservation, stress_threshold: float, drop_threshold: float
) -> Alert | None:
    """Create a water stress alert if NDMI went below `stress_threshold` or fell by at least `drop_threshold`.

    The low value alerts only when the stress starts. While NDMI stays low, later observations do not repeat it.
    """
    current = observation.ndmi_mean
    if current is None:
        return None
    previous = previous_observation(db, observation.field_id, observation.observed_on)
    previous_mean = previous.ndmi_mean if previous is not None else None

    drop = round(previous_mean - current, 4) if previous_mean is not None else None
    stress_started = current < stress_threshold and (previous_mean is None or previous_mean >= stress_threshold)
    sharp_drop = drop is not None and drop >= drop_threshold
    if not (stress_started or sharp_drop):
        return None
    return _store(db, ALERT_NDMI_STRESS, observation, current, previous, previous_mean, drop)


def detect_ndre_low(db: Session, observation: NdviObservation, settings: Settings) -> Alert | None:
    """Create a nitrogen alert when NDRE becomes low. While it stays low, later observations do not repeat it."""
    if observation.ndre_mean is None or nitrogen_level(observation.ndre_mean, observation.ndvi_mean, settings) != "low":
        return None
    previous = previous_observation(db, observation.field_id, observation.observed_on)
    if previous is not None and nitrogen_level(previous.ndre_mean, previous.ndvi_mean, settings) == "low":
        return None
    previous_mean = previous.ndre_mean if previous is not None else None
    return _store(db, ALERT_NDRE_LOW, observation, observation.ndre_mean, previous, previous_mean, None)


def detect_alerts(db: Session, observation: NdviObservation, settings: Settings) -> list[Alert]:
    """Run every check on a new observation. Returns the alerts found."""
    found = [
        detect_drop(db, observation, settings.ndvi_drop_threshold),
        detect_ndmi_stress(db, observation, settings.ndmi_stress_threshold, settings.ndmi_drop_threshold),
        detect_ndre_low(db, observation, settings),
    ]
    return [alert for alert in found if alert is not None]


def pending_alerts(db: Session) -> list[Alert]:
    """Return alerts that are not sent yet, oldest first."""
    return list(db.scalars(select(Alert).where(Alert.sent_at.is_(None)).order_by(Alert.id)))
