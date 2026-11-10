"""Tests for scene search and selection. No network: STAC items are built in memory."""

from datetime import UTC, date, datetime
from typing import Any

import pystac
import pytest
from fastapi.testclient import TestClient
from pystac_client.exceptions import APIError
from shapely.geometry import box, mapping

from app.services import stac
from app.services.stac import Scene, pick_best_scene, search_scenes

FIELD = box(69.20, 41.30, 69.21, 41.31)
TILE = box(68.9, 41.0, 70.2, 42.0)  # fully covers FIELD
EDGE_TILE = box(69.205, 41.0, 70.2, 42.0)  # covers only part of FIELD

SQUARE = mapping(FIELD)


def _item(
    item_id: str,
    day: int,
    cloud: float,
    footprint: Any = TILE,
    assets: tuple[str, ...] = stac.REQUIRED_ASSETS,
) -> pystac.Item:
    item = pystac.Item(
        id=item_id,
        geometry=mapping(footprint),
        bbox=list(footprint.bounds),
        datetime=datetime(2026, 10, day, 6, 10, tzinfo=UTC),
        properties={"eo:cloud_cover": cloud},
    )
    for key in assets:
        item.add_asset(key, pystac.Asset(href=f"https://example.com/{item_id}/{key}.tif"))
    return item


# --- pick_best_scene ---


def test_picks_newest_scene_under_threshold() -> None:
    items = [_item("old", 1, 5.0), _item("new", 10, 15.0), _item("middle", 5, 0.0)]

    scene = pick_best_scene(items, FIELD, max_cloud_cover=20)

    assert scene is not None
    assert scene.id == "new"
    assert scene.cloud_cover == 15.0
    assert scene.assets["B08"] == "https://example.com/new/B08.tif"


def test_skips_too_cloudy_scene() -> None:
    items = [_item("clear", 1, 5.0), _item("cloudy", 10, 80.0)]

    scene = pick_best_scene(items, FIELD, max_cloud_cover=20)

    assert scene is not None
    assert scene.id == "clear"


def test_skips_tile_that_covers_field_partly() -> None:
    items = [_item("full", 1, 5.0), _item("edge", 10, 5.0, footprint=EDGE_TILE)]

    scene = pick_best_scene(items, FIELD, max_cloud_cover=20)

    assert scene is not None
    assert scene.id == "full"


def test_skips_scene_without_required_band() -> None:
    items = [_item("complete", 1, 5.0), _item("no_scl", 10, 5.0, assets=("B04", "B08"))]

    scene = pick_best_scene(items, FIELD, max_cloud_cover=20)

    assert scene is not None
    assert scene.id == "complete"


def test_same_day_prefers_less_cloudy_tile() -> None:
    items = [_item("tile_a", 10, 18.0), _item("tile_b", 10, 3.0)]

    scene = pick_best_scene(items, FIELD, max_cloud_cover=20)

    assert scene is not None
    assert scene.id == "tile_b"


def test_returns_none_when_nothing_matches() -> None:
    assert pick_best_scene([_item("cloudy", 1, 90.0)], FIELD, max_cloud_cover=20) is None
    assert pick_best_scene([], FIELD, max_cloud_cover=20) is None


# --- search_scenes (STAC client replaced) ---


class _FakeSearch:
    def __init__(self, items: list[pystac.Item]) -> None:
        self._items = items

    def items(self) -> list[pystac.Item]:
        return self._items


class _FakeClient:
    last_search_kwargs: dict[str, Any] = {}

    def search(self, **kwargs: Any) -> _FakeSearch:
        _FakeClient.last_search_kwargs = kwargs
        return _FakeSearch([_item("a", 1, 5.0)])


def test_search_scenes_sends_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(stac.Client, "open", lambda url: _FakeClient())

    items = search_scenes(FIELD, date(2026, 10, 1), date(2026, 10, 31), max_cloud_cover=20)

    kwargs = _FakeClient.last_search_kwargs
    assert [i.id for i in items] == ["a"]
    assert kwargs["collections"] == ["sentinel-2-l2a"]
    assert kwargs["query"] == {"eo:cloud_cover": {"lte": 20}}
    start, end = kwargs["datetime"]
    assert start == datetime(2026, 10, 1, tzinfo=UTC)
    assert end.date() == date(2026, 10, 31) and end.hour == 23


# --- GET /fields/{id}/scenes/best ---


def _create_field(client: TestClient) -> int:
    response = client.post("/fields", json={"name": "Paxta-1", "geometry": SQUARE})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_best_scene_endpoint_returns_scene(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    scene = Scene(
        id="S2B_TEST",
        datetime=datetime(2026, 10, 10, 6, 10, tzinfo=UTC),
        cloud_cover=3.5,
        assets={"B04": "b04.tif", "B08": "b08.tif", "SCL": "scl.tif"},
    )
    monkeypatch.setattr("app.api.fields.find_best_scene", lambda polygon, start, end: scene)
    field_id = _create_field(db_client)

    response = db_client.get(f"/fields/{field_id}/scenes/best?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 200
    assert response.json()["id"] == "S2B_TEST"
    assert response.json()["cloud_cover"] == 3.5


def test_best_scene_endpoint_404_when_no_scene(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.fields.find_best_scene", lambda polygon, start, end: None)
    field_id = _create_field(db_client)

    response = db_client.get(f"/fields/{field_id}/scenes/best?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 404


def test_best_scene_endpoint_502_on_stac_error(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(polygon: Any, start: date, end: date) -> None:
        raise APIError("connection refused")

    monkeypatch.setattr("app.api.fields.find_best_scene", fail)
    field_id = _create_field(db_client)

    response = db_client.get(f"/fields/{field_id}/scenes/best?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 502


def test_best_scene_endpoint_rejects_reversed_dates(client: TestClient) -> None:
    response = client.get("/fields/1/scenes/best?start=2026-10-31&end=2026-10-01")

    assert response.status_code == 422
