"""Pydantic schemas for NDVI observations."""

from datetime import date, datetime
from typing import Literal

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


class BackfillJobRead(BaseModel):
    """A background job that fills the NDVI history. saved_count grows while the job runs."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    field_id: int
    status: Literal["running", "done", "failed"]
    start: date
    end: date
    saved_count: int
    created_at: datetime
    finished_at: datetime | None
