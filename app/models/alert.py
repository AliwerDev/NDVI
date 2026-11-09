"""Alert model: a sharp NDVI drop between two observations of a field."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Alert(Base):
    """One NDVI drop alert. sent_at stays empty until the Telegram messages are sent."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    # One alert per observation at most.
    observation_id: Mapped[int] = mapped_column(
        ForeignKey("ndvi_observations.id", ondelete="CASCADE"), unique=True
    )
    previous_observation_id: Mapped[int] = mapped_column(
        ForeignKey("ndvi_observations.id", ondelete="CASCADE")
    )
    previous_mean: Mapped[float] = mapped_column(Float)
    current_mean: Mapped[float] = mapped_column(Float)
    drop: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
