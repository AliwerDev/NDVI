"""Pydantic schemas for observations (NDVI, NDMI, NDRE)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, computed_field

from app.config import get_settings
from app.services.recommendations import nitrogen_advice


class NitrogenAdviceRead(BaseModel):
    """Nitrogen advice from NDRE. level "unknown": the plants are too sparse for a reliable NDRE."""

    model_config = ConfigDict(from_attributes=True)

    level: Literal["low", "medium", "ok", "unknown"]
    text: str
    low_threshold: float
    ok_threshold: float


class ObservationRead(BaseModel):
    """One observation of a field. NDMI and NDRE are null for observations saved before they were added."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    field_id: int
    observed_on: date
    scene_id: str
    scene_cloud_cover: float
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    ndmi_mean: float | None
    ndmi_min: float | None
    ndmi_max: float | None
    ndre_mean: float | None
    ndre_min: float | None
    ndre_max: float | None
    clear_fraction: float
    cog_path: str
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def nitrogen_advice(self) -> NitrogenAdviceRead | None:
        advice = nitrogen_advice(self.ndre_mean, self.ndvi_mean, get_settings())
        return NitrogenAdviceRead.model_validate(advice) if advice is not None else None


class BackfillJobRead(BaseModel):
    """A background job that fills the observation history. saved_count grows while the job runs."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    field_id: int
    status: Literal["running", "done", "failed"]
    start: date
    end: date
    saved_count: int
    created_at: datetime
    finished_at: datetime | None
