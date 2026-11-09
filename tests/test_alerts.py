"""Tests for NDVI drop detection."""

from sqlalchemy.orm import Session

from app.models import Field
from app.services.alerts import detect_drop, pending_alerts
from app.services.history import save_observation
from tests.factories import make_result

THRESHOLD = 0.15


def test_no_alert_for_first_observation(db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(10, 0.7))

    assert detect_drop(db_session, observation, THRESHOLD) is None


def test_no_alert_for_small_drop(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.70))
    observation = save_observation(db_session, field.id, make_result(15, 0.60))

    assert detect_drop(db_session, observation, THRESHOLD) is None


def test_no_alert_when_ndvi_grows(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.40))
    observation = save_observation(db_session, field.id, make_result(15, 0.70))

    assert detect_drop(db_session, observation, THRESHOLD) is None


def test_alert_for_drop_equal_to_threshold(db_session: Session, field: Field) -> None:
    previous = save_observation(db_session, field.id, make_result(10, 0.70))
    observation = save_observation(db_session, field.id, make_result(15, 0.55))

    alert = detect_drop(db_session, observation, THRESHOLD)

    assert alert is not None
    assert alert.drop == 0.15
    assert alert.previous_observation_id == previous.id
    assert alert.sent_at is None


def test_compares_with_previous_not_oldest(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(1, 0.80))
    save_observation(db_session, field.id, make_result(10, 0.60))
    observation = save_observation(db_session, field.id, make_result(15, 0.55))

    # 0.60 -> 0.55 is small, although 0.80 -> 0.55 would be large.
    assert detect_drop(db_session, observation, THRESHOLD) is None


def test_same_observation_gives_one_alert(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.70))
    observation = save_observation(db_session, field.id, make_result(15, 0.40))

    first = detect_drop(db_session, observation, THRESHOLD)
    second = detect_drop(db_session, observation, THRESHOLD)

    assert first is not None and second is not None
    assert first.id == second.id
    assert len(pending_alerts(db_session)) == 1
