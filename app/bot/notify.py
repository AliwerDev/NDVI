"""Send pending NDVI drop alerts to the Telegram account of each field's owner."""

import asyncio
import logging
from datetime import UTC, datetime

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from sqlalchemy.orm import Session

from app.bot import messages
from app.bot.subscriptions import alert_chat_id
from app.config import get_settings
from app.models import Field, NdviObservation
from app.services.alerts import pending_alerts

logger = logging.getLogger(__name__)


async def deliver(token: str, outbox: list[tuple[int, str]]) -> int:
    """Send (chat_id, text) messages. Returns the number of messages sent."""
    bot = Bot(token)
    sent = 0
    try:
        for chat_id, text in outbox:
            try:
                await bot.send_message(chat_id, text)
                sent += 1
            except TelegramAPIError:
                # For example, the user blocked the bot. Other chats must still get the alert.
                logger.warning("Could not send alert to chat %s", chat_id, exc_info=True)
    finally:
        await bot.session.close()
    return sent


def send_pending_alerts(db: Session) -> int:
    """Send every unsent alert to the owner's Telegram and mark the alerts as sent.

    Returns the number of messages sent. Without TELEGRAM_BOT_TOKEN nothing is sent and alerts stay pending.
    """
    token = get_settings().telegram_bot_token
    alerts = pending_alerts(db)
    if not alerts:
        return 0
    if not token:
        logger.info("TELEGRAM_BOT_TOKEN is not set, %d alerts stay pending", len(alerts))
        return 0

    outbox: list[tuple[int, str]] = []
    for alert in alerts:
        field = db.get(Field, alert.field_id)
        previous = db.get(NdviObservation, alert.previous_observation_id)
        current = db.get(NdviObservation, alert.observation_id)
        chat_id = alert_chat_id(db, field) if field is not None else None
        if field is None or previous is None or current is None or chat_id is None:
            continue
        text = messages.ndvi_drop_alert(
            field.name, previous.observed_on, alert.previous_mean, current.observed_on, alert.current_mean, alert.drop
        )
        outbox.append((chat_id, text))

    sent = asyncio.run(deliver(token, outbox)) if outbox else 0

    # Alerts of owners without Telegram are also marked, so that linking Telegram later does not send old alerts.
    now = datetime.now(UTC)
    for alert in alerts:
        alert.sent_at = now
    db.commit()
    return sent
