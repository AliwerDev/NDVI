"""Tests for the field area service."""

import pytest
from rasterio.warp import transform_geom
from shapely.geometry import Polygon, box, mapping, shape

from app.services.area import format_area, polygon_area_ha

FIELD = box(69.20, 41.30, 69.21, 41.31)


def _utm_area_ha(polygon: Polygon) -> float:
    """Planar area in UTM zone 42N (EPSG:32642), which covers Tashkent. The reference value."""
    return shape(transform_geom("EPSG:4326", "EPSG:32642", mapping(polygon))).area / 10_000


def test_area_matches_utm_area() -> None:
    assert polygon_area_ha(FIELD) == pytest.approx(_utm_area_ha(FIELD), rel=0.005)


def test_area_subtracts_holes() -> None:
    with_hole = FIELD.difference(box(69.202, 41.302, 69.204, 41.304))

    assert polygon_area_ha(with_hole) < polygon_area_ha(FIELD)
    assert polygon_area_ha(with_hole) == pytest.approx(_utm_area_ha(with_hole), rel=0.005)


def test_area_does_not_depend_on_ring_direction() -> None:
    reversed_field = Polygon(list(FIELD.exterior.coords)[::-1])

    assert polygon_area_ha(reversed_field) == pytest.approx(polygon_area_ha(FIELD))


@pytest.mark.parametrize(
    ("area_ha", "expected"),
    [(0.324, "0.32 ga"), (12.44, "12.4 ga"), (148.3, "148 ga")],
)
def test_format_area(area_ha: float, expected: str) -> None:
    assert format_area(area_ha) == expected
