"""Pydantic schemas for NDVI observations."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ObservationRead(BaseModel):
    """One NDVI observation of a field."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    field_id: int
    observed_on: date
    scene_id: str
    scene_cloud_cover: float
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    clear_fraction: float
    cog_path: str
    created_at: datetime


class BackfillStarted(BaseModel):
    """Response of the backfill endpoint. The work continues in the background."""

    status: str = "started"
    field_id: int
    start: date
    end: date
