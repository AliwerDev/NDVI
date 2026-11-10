"""Tests for /fields. Validation tests run without a database, CRUD tests need TEST_DATABASE_URL."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

# A small square near Tashkent, [longitude, latitude].
SQUARE = {
    "type": "Polygon",
    "coordinates": [[[69.20, 41.30], [69.21, 41.30], [69.21, 41.31], [69.20, 41.31], [69.20, 41.30]]],
}
OTHER_SQUARE = {
    "type": "Polygon",
    "coordinates": [[[69.30, 41.40], [69.32, 41.40], [69.32, 41.42], [69.30, 41.42], [69.30, 41.40]]],
}


def _create(client: TestClient, name: str = "Paxta-1", geometry: dict[str, Any] = SQUARE) -> dict[str, Any]:
    response = client.post("/fields", json={"name": name, "geometry": geometry})
    assert response.status_code == 201, response.text
    return response.json()


# --- Validation (no database needed) ---

INVALID_GEOMETRIES = {
    "not closed": {
        "type": "Polygon",
        "coordinates": [[[69.20, 41.30], [69.21, 41.30], [69.21, 41.31], [69.20, 41.31]]],
    },
    "self-intersecting": {
        "type": "Polygon",
        "coordinates": [[[69.20, 41.30], [69.21, 41.31], [69.21, 41.30], [69.20, 41.31], [69.20, 41.30]]],
    },
    "lat/lon swapped out of range": {
        "type": "Polygon",
        "coordinates": [[[41.30, 190.0], [41.31, 190.0], [41.31, 191.0], [41.30, 190.0]]],
    },
    "wrong type": {"type": "Point", "coordinates": [69.20, 41.30]},
}


@pytest.mark.parametrize("geometry", INVALID_GEOMETRIES.values(), ids=INVALID_GEOMETRIES.keys())
def test_create_rejects_invalid_geometry(client: TestClient, geometry: dict[str, Any]) -> None:
    response = client.post("/fields", json={"name": "Bad", "geometry": geometry})
    assert response.status_code == 422


def test_create_rejects_empty_name(client: TestClient) -> None:
    response = client.post("/fields", json={"name": "   ", "geometry": SQUARE})
    assert response.status_code == 422


# --- CRUD (test database) ---


def test_create_returns_feature(db_client: TestClient) -> None:
    feature = _create(db_client)

    assert feature["type"] == "Feature"
    assert isinstance(feature["id"], int)
    assert feature["geometry"] == SQUARE
    assert feature["properties"]["name"] == "Paxta-1"
    assert feature["properties"]["created_at"]
    # 0.01° × 0.01° near Tashkent: about 1113 m × 836 m.
    assert feature["properties"]["area_ha"] == pytest.approx(93.1, abs=0.1)


def test_get_field(db_client: TestClient) -> None:
    created = _create(db_client)

    response = db_client.get(f"/fields/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_list_fields(db_client: TestClient) -> None:
    first = _create(db_client, name="A")
    second = _create(db_client, name="B", geometry=OTHER_SQUARE)

    response = db_client.get("/fields")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert [f["id"] for f in body["features"]] == [first["id"], second["id"]]


def test_update_name_keeps_geometry(db_client: TestClient) -> None:
    created = _create(db_client)

    response = db_client.patch(f"/fields/{created['id']}", json={"name": "Bug'doy-2"})

    assert response.status_code == 200
    assert response.json()["properties"]["name"] == "Bug'doy-2"
    assert response.json()["geometry"] == SQUARE


def test_update_geometry(db_client: TestClient) -> None:
    created = _create(db_client)

    response = db_client.patch(f"/fields/{created['id']}", json={"geometry": OTHER_SQUARE})

    assert response.status_code == 200
    assert response.json()["geometry"] == OTHER_SQUARE
    assert response.json()["properties"]["name"] == "Paxta-1"


def test_delete_field(db_client: TestClient) -> None:
    created = _create(db_client)

    response = db_client.delete(f"/fields/{created['id']}")

    assert response.status_code == 204
    assert db_client.get(f"/fields/{created['id']}").status_code == 404


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_missing_field_returns_404(db_client: TestClient, method: str) -> None:
    kwargs = {"json": {"name": "X"}} if method == "patch" else {}

    response = getattr(db_client, method)("/fields/999999", **kwargs)

    assert response.status_code == 404
