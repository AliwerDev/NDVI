"""TelegramSubscription model: a Telegram chat that receives alerts for a field."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TelegramSubscription(Base):
    """Link between a Telegram chat and a field."""

    __tablename__ = "telegram_subscriptions"
    __table_args__ = (UniqueConstraint("chat_id", "field_id", name="uq_telegram_subscriptions_chat_field"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # Telegram chat ids can be larger than 32 bits.
    chat_id: Mapped[int] = mapped_column(BigInteger)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
