"""ORM models. Import every model here so Alembic sees all tables."""

from app.models.alert import Alert
from app.models.base import Base
from app.models.field import Field
from app.models.ndvi_observation import NdviObservation
from app.models.telegram_subscription import TelegramSubscription

__all__ = ["Alert", "Base", "Field", "NdviObservation", "TelegramSubscription"]
