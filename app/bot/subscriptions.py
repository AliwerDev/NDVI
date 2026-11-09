"""Database operations behind the bot commands. They return the Uzbek reply text."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot import messages
from app.models import Field, TelegramSubscription, User
from app.services.auth import TelegramIdentity, confirm_telegram_login, use_link_code
from app.services.history import latest_observation


def parse_field_id(args: str | None) -> int | None:
    """Read the field number from the command arguments, for example "3" in "/link 3"."""
    if not args:
        return None
    first = args.split()[0]
    return int(first) if first.isdigit() else None


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


def link_with_code(db: Session, code: str, identity: TelegramIdentity, chat_id: int) -> str:
    result = use_link_code(db, code, identity, chat_id)
    if result is None:
        return messages.LINK_EXPIRED
    if result.already_linked:
        return messages.already_linked(result.field.name)
    return messages.linked(result.field.name)


def link_chat(db: Session, chat_id: int, field_id: int, telegram_user_id: int) -> str:
    """Subscribe the chat to the field's alerts. Only the owner's Telegram account can do this."""
    field = db.get(Field, field_id)
    owner = db.get(User, field.owner_id) if field is not None and field.owner_id is not None else None
    if field is None or owner is None or owner.telegram_id != telegram_user_id:
        # The same answer for "missing" and "not yours", so field numbers of other users stay hidden.
        return messages.field_not_found(field_id)

    existing = db.scalar(
        select(TelegramSubscription).where(
            TelegramSubscription.chat_id == chat_id, TelegramSubscription.field_id == field_id
        )
    )
    if existing is not None:
        return messages.already_linked(field.name)

    db.add(TelegramSubscription(chat_id=chat_id, field_id=field_id))
    db.commit()
    return messages.linked(field.name)


def unlink_chat(db: Session, chat_id: int, field_id: int) -> str:
    """Remove the chat's subscription to the field."""
    subscription = db.scalar(
        select(TelegramSubscription).where(
            TelegramSubscription.chat_id == chat_id, TelegramSubscription.field_id == field_id
        )
    )
    if subscription is None:
        return messages.not_linked(field_id)
    db.delete(subscription)
    db.commit()
    return messages.unlinked(field_id)


def list_chat_fields(db: Session, chat_id: int) -> str:
    """Show the chat's fields with the latest NDVI."""
    fields = db.scalars(
        select(Field)
        .join(TelegramSubscription, TelegramSubscription.field_id == Field.id)
        .where(TelegramSubscription.chat_id == chat_id)
        .order_by(Field.id)
    ).all()
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
            )
        )
    return messages.fields_list(lines)


def subscribed_chat_ids(db: Session, field_id: int) -> list[int]:
    """Return the chats that receive alerts for the field."""
    return list(
        db.scalars(select(TelegramSubscription.chat_id).where(TelegramSubscription.field_id == field_id))
    )
