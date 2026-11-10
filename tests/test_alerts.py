"""Tests for alert detection: NDVI drop, water stress (NDMI) and low nitrogen (NDRE)."""

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Field
from app.models.alert import ALERT_NDMI_STRESS, ALERT_NDRE_LOW, ALERT_NDVI_DROP
from app.services.alerts import detect_alerts, detect_drop, detect_ndmi_stress, detect_ndre_low, pending_alerts
from app.services.history import save_observation
from tests.factories import make_result

THRESHOLD = 0.15
# Defaults: NDMI stress below 0.0 or a drop of 0.10, NDRE low below 0.20 when NDVI is at least 0.30.
SETTINGS = Settings(_env_file=None)  # type: ignore[call-arg]
STRESS, NDMI_DROP = SETTINGS.ndmi_stress_threshold, SETTINGS.ndmi_drop_threshold


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


# --- NDMI: water stress ---


def test_ndmi_alert_when_stress_starts(db_session: Session, field: Field) -> None:
    previous = save_observation(db_session, field.id, make_result(10, 0.6, ndmi=0.04))
    observation = save_observation(db_session, field.id, make_result(15, 0.6, ndmi=-0.05))

    alert = detect_ndmi_stress(db_session, observation, STRESS, NDMI_DROP)

    assert alert is not None
    assert alert.kind == ALERT_NDMI_STRESS
    assert alert.current_mean == -0.05
    assert alert.previous_observation_id == previous.id
    assert alert.drop == 0.09


def test_ndmi_low_value_does_not_repeat(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.6, ndmi=-0.05))
    observation = save_observation(db_session, field.id, make_result(15, 0.6, ndmi=-0.08))

    assert detect_ndmi_stress(db_session, observation, STRESS, NDMI_DROP) is None


def test_ndmi_alert_for_sharp_drop_above_threshold(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.6, ndmi=0.22))
    observation = save_observation(db_session, field.id, make_result(15, 0.6, ndmi=0.12))

    alert = detect_ndmi_stress(db_session, observation, STRESS, NDMI_DROP)

    assert alert is not None and alert.drop == 0.10


def test_first_ndmi_below_threshold_gives_alert_without_previous(db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(10, 0.6, ndmi=-0.1))

    alert = detect_ndmi_stress(db_session, observation, STRESS, NDMI_DROP)

    assert alert is not None
    assert alert.previous_observation_id is None and alert.drop is None


def test_no_ndmi_alert_without_ndmi_value(db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(10, 0.6))

    assert detect_ndmi_stress(db_session, observation, STRESS, NDMI_DROP) is None


# --- NDRE: nitrogen ---


def test_ndre_alert_when_nitrogen_becomes_low(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.6, ndre=0.25))
    observation = save_observation(db_session, field.id, make_result(15, 0.6, ndre=0.18))

    alert = detect_ndre_low(db_session, observation, SETTINGS)

    assert alert is not None
    assert alert.kind == ALERT_NDRE_LOW
    assert alert.current_mean == 0.18 and alert.previous_mean == 0.25


def test_ndre_low_value_does_not_repeat(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.6, ndre=0.18))
    observation = save_observation(db_session, field.id, make_result(15, 0.6, ndre=0.17))

    assert detect_ndre_low(db_session, observation, SETTINGS) is None


def test_no_ndre_alert_for_sparse_plants(db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(10, 0.2, ndre=0.1))

    assert detect_ndre_low(db_session, observation, SETTINGS) is None


# --- all checks ---


def test_one_observation_can_give_one_alert_of_each_kind(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.80, ndmi=0.10, ndre=0.30))
    observation = save_observation(db_session, field.id, make_result(15, 0.60, ndmi=-0.05, ndre=0.15))

    first = detect_alerts(db_session, observation, SETTINGS)
    second = detect_alerts(db_session, observation, SETTINGS)

    assert sorted(a.kind for a in first) == sorted([ALERT_NDVI_DROP, ALERT_NDMI_STRESS, ALERT_NDRE_LOW])
    assert sorted(a.id for a in first) == sorted(a.id for a in second)
    assert len(pending_alerts(db_session)) == 3
