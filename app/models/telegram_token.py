"""TelegramToken model: a one-time code that the bot receives through a t.me deep link."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

KIND_LOGIN = "login"
KIND_LINK = "link"


class TelegramToken(Base):
    """A one-time Telegram code.

    login: the browser waits with poll_token. The bot sets user_id and confirmed_at.
           The browser then gets a session once and consumed_at is set.
    link:  user_id is set at creation. The bot binds the Telegram account to that user and sets confirmed_at.
    """

    __tablename__ = "telegram_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    # The code goes through Telegram, so it only identifies the request.
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # The poll token stays in the browser. Only it can turn a confirmed login into a session.
    poll_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
