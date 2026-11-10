"""Tests for NDVI observations: storage, time series endpoint and backfill."""

from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import box, mapping
from sqlalchemy.orm import Session

from app.models import Field, NdviObservation
from app.services import history
from app.services.history import (
    backfill_field,
    latest_observation,
    list_observations,
    previous_observation,
    save_observation,
)
from tests.factories import make_result

FIELD_GEOMETRY = box(69.20, 41.30, 69.21, 41.31)




# --- service ---


def test_save_and_list_in_date_order(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(20, 0.6))
    save_observation(db_session, field.id, make_result(5, 0.4))
    save_observation(db_session, field.id, make_result(12, 0.5))

    observations = list_observations(db_session, field.id)

    assert [o.observed_on.day for o in observations] == [5, 12, 20]
    assert [o.ndvi_mean for o in observations] == [0.4, 0.5, 0.6]


def test_same_date_updates_existing_observation(db_session: Session, field: Field) -> None:
    first = save_observation(db_session, field.id, make_result(10, 0.4, scene_id="TILE_A"))
    second = save_observation(db_session, field.id, make_result(10, 0.7, scene_id="TILE_B"))

    assert second.id == first.id
    assert len(list_observations(db_session, field.id)) == 1
    assert second.ndvi_mean == 0.7
    assert second.scene_id == "TILE_B"


def test_list_filters_by_date_range(db_session: Session, field: Field) -> None:
    for day in (1, 10, 20, 30):
        save_observation(db_session, field.id, make_result(day, 0.5))

    observations = list_observations(db_session, field.id, start=date(2026, 10, 5), end=date(2026, 10, 25))

    assert [o.observed_on.day for o in observations] == [10, 20]


def test_latest_and_previous_observation(db_session: Session, field: Field) -> None:
    for day in (1, 10, 20):
        save_observation(db_session, field.id, make_result(day, 0.5))

    latest = latest_observation(db_session, field.id)
    assert latest is not None and latest.observed_on.day == 20
    previous = previous_observation(db_session, field.id, before=date(2026, 10, 20))
    assert previous is not None and previous.observed_on.day == 10
    assert previous_observation(db_session, field.id, before=date(2026, 10, 1)) is None


def test_deleting_field_deletes_observations(db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.5))

    db_session.delete(field)
    db_session.commit()

    assert db_session.query(NdviObservation).count() == 0


def test_backfill_saves_everymake_result(db_session: Session, field: Field, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        history, "iter_field_ndvi_series", lambda *args, **kwargs: iter([make_result(20, 0.6), make_result(10, 0.5)])
    )
    saved: list[NdviObservation] = []

    observations = backfill_field(db_session, field, date(2026, 10, 1), date(2026, 10, 31), on_saved=saved.append)

    assert len(observations) == 2
    assert saved == observations
    assert [o.observed_on.day for o in list_observations(db_session, field.id)] == [10, 20]


# --- endpoints ---


def _create_field(client: TestClient) -> int:
    response = client.post("/fields", json={"name": "Paxta-1", "geometry": mapping(FIELD_GEOMETRY)})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_history_endpoint(db_client: TestClient, db_session: Session) -> None:
    field_id = _create_field(db_client)
    save_observation(db_session, field_id, make_result(20, 0.6))
    save_observation(db_session, field_id, make_result(10, 0.5))

    response = db_client.get(f"/fields/{field_id}/ndvi")

    assert response.status_code == 200
    body = response.json()
    assert [o["observed_on"] for o in body] == ["2026-10-10", "2026-10-20"]
    assert body[0]["ndvi_mean"] == 0.5


def test_history_endpoint_404_for_missing_field(db_client: TestClient) -> None:
    assert db_client.get("/fields/999999/ndvi").status_code == 404


def test_backfill_endpoint_starts_background_job(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setattr("app.api.ndvi.run_backfill", lambda *args: calls.append(args))
    field_id = _create_field(db_client)

    response = db_client.post(f"/fields/{field_id}/ndvi/backfill?start=2026-04-01&end=2026-10-31")

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "running"
    assert body["saved_count"] == 0
    assert calls == [(body["id"],)]
