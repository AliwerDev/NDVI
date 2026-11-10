"""Database operations behind the bot commands. They return the Uzbek reply text."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot import messages
from app.models import Field, User
from app.services.auth import LinkResult, TelegramIdentity, confirm_telegram_login, use_link_code
from app.services.history import latest_observation

_LINK_REPLIES = {
    LinkResult.LINKED: messages.LINKED,
    LinkResult.ALREADY_LINKED: messages.ALREADY_LINKED,
    LinkResult.TAKEN: messages.LINK_TAKEN,
    LinkResult.EXPIRED: messages.LINK_EXPIRED,
}


@dataclass(frozen=True)
class StartPayload:
    kind: str  # "login" or "link"
    code: str


def parse_start_payload(args: str | None) -> StartPayload | None:
    """Read a deep link payload: t.me/<bot>?start=login_<code> sends "/start login_<code>"."""
    if not args:
        return None
    # The code itself can contain "_", so split only at the first one.
    kind, separator, code = args.strip().partition("_")
    if not separator or not code or kind not in ("login", "link"):
        return None
    return StartPayload(kind=kind, code=code)


def confirm_login(db: Session, code: str, identity: TelegramIdentity) -> str:
    return messages.LOGIN_CONFIRMED if confirm_telegram_login(db, code, identity) else messages.LOGIN_EXPIRED


def link_with_code(db: Session, code: str, identity: TelegramIdentity) -> str:
    return _LINK_REPLIES[use_link_code(db, code, identity)]


def list_user_fields(db: Session, telegram_user_id: int) -> str:
    """Show the fields of the account that this Telegram account belongs to, with the latest NDVI."""
    user = db.scalar(select(User).where(User.telegram_id == telegram_user_id))
    fields = (
        db.scalars(select(Field).where(Field.owner_id == user.id).order_by(Field.id)).all() if user is not None else []
    )
    if not fields:
        return messages.NO_FIELDS

    lines = []
    for field in fields:
        latest = latest_observation(db, field.id)
        lines.append(
            messages.field_line(
                field.id,
                field.name,
                latest.ndvi_mean if latest else None,
                latest.observed_on if latest else None,
                latest.ndmi_mean if latest else None,
                latest.ndre_mean if latest else None,
            )
        )
    return messages.fields_list(lines)


def alert_chat_id(db: Session, field: Field) -> int | None:
    """The chat that gets the field's alerts: the owner's private chat with the bot.

    In a private chat, the chat id equals the Telegram user id.
    """
    owner = db.get(User, field.owner_id) if field.owner_id is not None else None
    return owner.telegram_id if owner is not None else None
