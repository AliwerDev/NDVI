"""Database operations behind the bot commands. They return the Uzbek reply text."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot import messages
from app.models import Field, TelegramSubscription
from app.services.history import latest_observation


def parse_field_id(args: str | None) -> int | None:
    """Read the field number from the command arguments, for example "3" in "/link 3"."""
    if not args:
        return None
    first = args.split()[0]
    return int(first) if first.isdigit() else None


def parse_start_payload(args: str | None) -> int | None:
    """Read the field number from a deep link payload: t.me/<bot>?start=link_3 sends "/start link_3"."""
    if not args or not args.startswith("link_"):
        return None
    return parse_field_id(args.removeprefix("link_"))


def link_chat(db: Session, chat_id: int, field_id: int) -> str:
    """Subscribe the chat to the field's alerts."""
    field = db.get(Field, field_id)
    if field is None:
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
