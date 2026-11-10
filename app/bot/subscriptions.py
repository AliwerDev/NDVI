"""Database operations behind the bot commands. They return the Uzbek reply text."""

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot import messages
from app.config import get_settings
from app.models import Field, User
from app.services.area import format_area, polygon_area_ha
from app.services.auth import LinkResult, TelegramIdentity, confirm_telegram_login, use_link_code
from app.services.field_weather import weather_advice
from app.services.history import latest_observation
from app.services.recommendations import nitrogen_level
from app.services.weather import Cell, WeatherError, fetch_forecast, field_cell, has_day, list_days, upsert_days

logger = logging.getLogger(__name__)

# /weather shows today and the next two days. A longer list makes the message hard to read on a phone.
WEATHER_DAYS = 3

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


def _user_fields(db: Session, telegram_user_id: int) -> list[Field]:
    """The fields of the account that this Telegram account belongs to."""
    user = db.scalar(select(User).where(User.telegram_id == telegram_user_id))
    if user is None:
        return []
    return list(db.scalars(select(Field).where(Field.owner_id == user.id).order_by(Field.id)))


def list_user_fields(db: Session, telegram_user_id: int, today: date) -> list[str]:
    """The fields of the account with the latest observation. Returns the messages to send, in Telegram HTML."""
    fields = _user_fields(db, telegram_user_id)
    if not fields:
        return [messages.NO_FIELDS]

    settings = get_settings()
    cards = []
    for number, field in enumerate(fields, start=1):
        latest = latest_observation(db, field.id)
        cards.append(
            messages.field_card(
                number,
                field.name,
                format_area(polygon_area_ha(to_shape(field.geometry))),
                today,
                latest.observed_on if latest else None,
                latest.ndvi_mean if latest else None,
                latest.ndmi_mean if latest else None,
                latest.ndre_mean if latest else None,
                nitrogen_level(latest.ndre_mean, latest.ndvi_mean, settings) if latest else None,
                settings.ndmi_stress_threshold,
            )
        )
    return messages.fields_reply(cards)


def _ensure_forecast(db: Session, cell: Cell, today: date) -> None:
    """Fetch the forecast of a new cell now. The daily update fills it only on the next morning."""
    if has_day(db, cell, today):
        return
    try:
        upsert_days(db, cell, fetch_forecast(cell), today)
    except WeatherError:
        # The stored days are still useful, so the command does not fail.
        logger.warning("Weather for cell %s: forecast request failed", cell, exc_info=True)


def user_weather(db: Session, telegram_user_id: int, today: date) -> list[str]:
    """The forecast and the advice for each field of the account. Returns the messages to send."""
    fields = _user_fields(db, telegram_user_id)
    if not fields:
        return [messages.NO_FIELDS]

    settings = get_settings()
    checked: set[Cell] = set()
    blocks = []
    for field in fields:
        cell = field_cell(field)
        if cell not in checked:
            _ensure_forecast(db, cell, today)
            checked.add(cell)

        days = list_days(db, cell, today, today + timedelta(days=WEATHER_DAYS - 1))
        day_lines = [
            messages.forecast_day_line(
                d.day,
                today,
                d.t_min,
                d.t_max,
                d.precipitation,
                d.wind_max,
                settings.frost_threshold_c,
                settings.heat_threshold_c,
            )
            for d in days
        ]

        # weather_advice gives no advice for bare soil, so a field without plants shows only the forecast.
        advice = weather_advice(db, field, today, settings)
        advice_lines = []
        if advice.irrigation is not None:
            advice_lines.append(messages.irrigation_line(advice.irrigation.text))
        if advice.has_forecast:
            advice_lines.append(messages.spray_line(advice.spray_day))

        blocks.append(messages.field_weather(field.name, day_lines, advice_lines))
    return messages.split_messages(blocks)


def alert_chat_id(db: Session, field: Field) -> int | None:
    """The chat that gets the field's alerts: the owner's private chat with the bot.

    In a private chat, the chat id equals the Telegram user id.
    """
    owner = db.get(User, field.owner_id) if field.owner_id is not None else None
    return owner.telegram_id if owner is not None else None
