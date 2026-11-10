"""Alert model: a problem found in one observation of a field (NDVI drop, water stress, low nitrogen)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

ALERT_NDVI_DROP = "ndvi_drop"
ALERT_NDMI_STRESS = "ndmi_stress"
ALERT_NDRE_LOW = "ndre_low"


class Alert(Base):
    """One alert. sent_at stays empty until the Telegram messages are sent.

    current_mean and previous_mean hold the index of the alert kind: NDVI, NDMI or NDRE.
    """

    __tablename__ = "alerts"
    # One alert of each kind per observation at most.
    __table_args__ = (UniqueConstraint("observation_id", "kind", name="uq_alerts_observation_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default=ALERT_NDVI_DROP, server_default=ALERT_NDVI_DROP)
    observation_id: Mapped[int] = mapped_column(ForeignKey("ndvi_observations.id", ondelete="CASCADE"))
    previous_observation_id: Mapped[int | None] = mapped_column(
        ForeignKey("ndvi_observations.id", ondelete="CASCADE")
    )
    previous_mean: Mapped[float | None] = mapped_column(Float)
    current_mean: Mapped[float] = mapped_column(Float)
    drop: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
