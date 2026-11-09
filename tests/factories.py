"""Helpers that build fake objects for tests."""

from datetime import UTC, datetime

from app.services.ndvi import FieldNdvi, NdviStats
from app.services.stac import Scene


def make_result(day: int, mean: float, scene_id: str | None = None, month: int = 10) -> FieldNdvi:
    """A fake NDVI result for 2026-<month>-<day>."""
    scene_id = scene_id or f"S2_{month}_{day}"
    return FieldNdvi(
        scene=Scene(
            id=scene_id, datetime=datetime(2026, month, day, 6, 10, tzinfo=UTC), cloud_cover=2.0, assets={}
        ),
        stats=NdviStats(
            mean=mean, min=mean - 0.1, max=mean + 0.1, clear_fraction=0.95, field_pixels=100, clear_pixels=95
        ),
        cog_path=f"data/ndvi/1/2026-{month:02d}-{day:02d}_{scene_id}.tif",
    )
