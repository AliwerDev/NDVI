"""Helpers that build fake objects for tests."""

from datetime import UTC, datetime

from app.services.ndvi import FieldNdvi, NdviStats
from app.services.stac import Scene


def _stats(mean: float) -> NdviStats:
    return NdviStats(mean=mean, min=mean - 0.1, max=mean + 0.1, clear_fraction=0.95, field_pixels=100, clear_pixels=95)


def make_result(
    day: int,
    mean: float,
    scene_id: str | None = None,
    month: int = 10,
    ndmi: float | None = None,
    ndre: float | None = None,
) -> FieldNdvi:
    """A fake result for 2026-<month>-<day>. mean is NDVI. Without ndmi and ndre the result has no extra indices."""
    scene_id = scene_id or f"S2_{month}_{day}"
    indices = {name: _stats(value) for name, value in (("ndmi", ndmi), ("ndre", ndre)) if value is not None}
    return FieldNdvi(
        scene=Scene(
            id=scene_id, datetime=datetime(2026, month, day, 6, 10, tzinfo=UTC), cloud_cover=2.0, assets={}
        ),
        stats=_stats(mean),
        cog_path=f"data/ndvi/1/2026-{month:02d}-{day:02d}_{scene_id}.tif",
        indices=indices,
    )
