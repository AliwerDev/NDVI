"""Tests for the scheduled update job. compute_field_ndvi and Telegram are replaced."""

from datetime import date, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app import scheduler
from app.models import Field
from app.services.alerts import pending_alerts
from app.services.history import list_observations, save_observation
from app.services.ndvi import FieldNdvi, NoClearSceneError
from tests.factories import make_result

TODAY = date(2026, 10, 20)


class FakeCompute:
    """Records the date range and returns a prepared result."""

    def __init__(self, result: FieldNdvi | None) -> None:
        self.result = result
        self.calls: list[tuple[date, date]] = []

    def __call__(self, field_id: int, polygon: Any, start: date, end: date) -> FieldNdvi:
        self.calls.append((start, end))
        if self.result is None:
            raise NoClearSceneError("too cloudy")
        return self.result


@pytest.fixture
def no_telegram(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(scheduler, "send_pending_alerts", lambda db: 0)


def test_new_field_searches_lookback_days(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeCompute(make_result(18, 0.6))
    monkeypatch.setattr(scheduler, "compute_field_ndvi", fake)

    observation = scheduler.update_field(db_session, field, TODAY)

    assert observation is not None and observation.observed_on == date(2026, 10, 18)
    assert fake.calls == [(TODAY - timedelta(days=10), TODAY)]


def test_existing_field_searches_after_last_observation(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch
) -> None:
    save_observation(db_session, field.id, make_result(12, 0.6))
    fake = FakeCompute(make_result(18, 0.6))
    monkeypatch.setattr(scheduler, "compute_field_ndvi", fake)

    scheduler.update_field(db_session, field, TODAY)

    assert fake.calls == [(date(2026, 10, 13), TODAY)]


def test_up_to_date_field_is_skipped(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    save_observation(db_session, field.id, make_result(20, 0.6))
    fake = FakeCompute(make_result(20, 0.6))
    monkeypatch.setattr(scheduler, "compute_field_ndvi", fake)

    assert scheduler.update_field(db_session, field, TODAY) is None
    assert fake.calls == []


def test_cloudy_field_gives_no_observation(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(scheduler, "compute_field_ndvi", FakeCompute(None))

    assert scheduler.update_field(db_session, field, TODAY) is None
    assert list_observations(db_session, field.id) == []


def test_run_update_creates_alert_for_sharp_drop(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch, no_telegram: None
) -> None:
    save_observation(db_session, field.id, make_result(10, 0.75))
    monkeypatch.setattr(scheduler, "compute_field_ndvi", FakeCompute(make_result(18, 0.45)))

    scheduler.run_update(db_session, TODAY)

    alerts = pending_alerts(db_session)
    assert len(alerts) == 1
    assert alerts[0].drop == pytest.approx(0.30)


def test_run_update_without_drop_creates_no_alert(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch, no_telegram: None
) -> None:
    save_observation(db_session, field.id, make_result(10, 0.60))
    monkeypatch.setattr(scheduler, "compute_field_ndvi", FakeCompute(make_result(18, 0.58)))

    scheduler.run_update(db_session, TODAY)

    assert pending_alerts(db_session) == []
    assert len(list_observations(db_session, field.id)) == 2
