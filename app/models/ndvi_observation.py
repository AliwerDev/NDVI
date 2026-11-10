"""NdviObservation model: NDVI, NDMI and NDRE statistics for one field on one date."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NdviObservation(Base):
    """One NDVI result. A field has at most one observation per date."""

    __tablename__ = "ndvi_observations"
    __table_args__ = (UniqueConstraint("field_id", "observed_on", name="uq_ndvi_observations_field_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    observed_on: Mapped[date] = mapped_column(Date)
    scene_id: Mapped[str] = mapped_column(String(100))
    scene_cloud_cover: Mapped[float] = mapped_column(Float)
    ndvi_mean: Mapped[float] = mapped_column(Float)
    ndvi_min: Mapped[float] = mapped_column(Float)
    ndvi_max: Mapped[float] = mapped_column(Float)
    # Empty for observations saved before NDMI and NDRE were added, or when the field has no clear 20 m pixel.
    ndmi_mean: Mapped[float | None] = mapped_column(Float)
    ndmi_min: Mapped[float | None] = mapped_column(Float)
    ndmi_max: Mapped[float | None] = mapped_column(Float)
    ndre_mean: Mapped[float | None] = mapped_column(Float)
    ndre_min: Mapped[float | None] = mapped_column(Float)
    ndre_max: Mapped[float | None] = mapped_column(Float)
    clear_fraction: Mapped[float] = mapped_column(Float)
    cog_path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
