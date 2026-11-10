"""Tests for backfill jobs: status, progress, failure, and the endpoints."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import box, mapping
from sqlalchemy.orm import Session

from app.models import BackfillJob, Field
from app.services import history
from app.services.backfill import (
    STALE_AFTER,
    BackfillAlreadyRunningError,
    latest_job,
    run_job,
    start_job,
    status_of,
)
from app.services.ndvi import FieldNdvi
from tests.factories import make_result

START = date(2026, 10, 1)
END = date(2026, 10, 31)


def _fake_series(monkeypatch: pytest.MonkeyPatch, series: Any) -> None:
    monkeypatch.setattr(history, "iter_field_ndvi_series", series)


# --- service ---


def test_run_job_saves_observations_and_finishes(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch
) -> None:
    _fake_series(monkeypatch, lambda *args, **kwargs: iter([make_result(20, 0.6), make_result(10, 0.5)]))
    job = start_job(db_session, field.id, START, END)

    run_job(db_session, job.id)

    db_session.refresh(job)
    assert job.status == "done"
    assert job.saved_count == 2
    assert job.finished_at is not None


def test_run_job_failure_keeps_saved_observations(
    db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_series(*args: Any, **kwargs: Any) -> Iterator[FieldNdvi]:
        yield make_result(20, 0.6)
        raise RuntimeError("STAC is down")

    _fake_series(monkeypatch, broken_series)
    job = start_job(db_session, field.id, START, END)

    run_job(db_session, job.id)

    db_session.refresh(job)
    assert job.status == "failed"
    assert job.saved_count == 1
    assert len(history.list_observations(db_session, field.id)) == 1


def test_second_running_job_is_refused(db_session: Session, field: Field) -> None:
    start_job(db_session, field.id, START, END)

    with pytest.raises(BackfillAlreadyRunningError):
        start_job(db_session, field.id, START, END)


def test_stale_job_counts_as_failed_and_allows_a_new_job(db_session: Session, field: Field) -> None:
    old = start_job(db_session, field.id, START, END)
    old.updated_at = datetime.now(UTC) - STALE_AFTER - timedelta(minutes=1)
    db_session.commit()

    assert status_of(old) == "failed"

    new = start_job(db_session, field.id, START, END)

    db_session.refresh(old)
    assert old.status == "failed"
    assert latest_job(db_session, field.id) == new
    assert status_of(new) == "running"


# --- endpoints ---


def _create_field(client: TestClient) -> int:
    response = client.post("/fields", json={"name": "Paxta-1", "geometry": mapping(box(69.20, 41.30, 69.21, 41.31))})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_status_endpoint_is_null_without_jobs(db_client: TestClient) -> None:
    field_id = _create_field(db_client)

    response = db_client.get(f"/fields/{field_id}/ndvi/backfill")

    assert response.status_code == 200
    assert response.json() is None


def test_status_endpoint_returns_running_job_and_blocks_second_start(
    db_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The background task does nothing, so the job stays "running".
    monkeypatch.setattr("app.api.ndvi.run_backfill", lambda *args: None)
    field_id = _create_field(db_client)
    started = db_client.post(f"/fields/{field_id}/ndvi/backfill?start=2026-04-01&end=2026-10-31").json()

    status = db_client.get(f"/fields/{field_id}/ndvi/backfill")
    second = db_client.post(f"/fields/{field_id}/ndvi/backfill?start=2026-04-01&end=2026-10-31")

    assert status.status_code == 200
    assert status.json()["id"] == started["id"]
    assert status.json()["status"] == "running"
    assert second.status_code == 409


def test_status_endpoint_404_for_missing_field(db_client: TestClient) -> None:
    assert db_client.get("/fields/999999/ndvi/backfill").status_code == 404


def test_deleting_field_deletes_jobs(db_session: Session, field: Field) -> None:
    start_job(db_session, field.id, START, END)

    db_session.delete(field)
    db_session.commit()

    assert db_session.query(BackfillJob).count() == 0
