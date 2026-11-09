"""Telegram per user: alerts go to the owner's Telegram account, not to per-field chat subscriptions

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Keep the alert recipient: an owner without a Telegram account gets the private chat
    # of the oldest subscription to one of their fields. In a private chat, the chat id is the user id.
    # A Telegram account that already belongs to another user is skipped.
    op.execute(
        """
        UPDATE users
        SET telegram_id = sub.chat_id
        FROM (
            SELECT DISTINCT ON (f.owner_id) f.owner_id, s.chat_id
            FROM telegram_subscriptions s
            JOIN fields f ON f.id = s.field_id
            WHERE s.chat_id > 0 AND f.owner_id IS NOT NULL
            ORDER BY f.owner_id, s.created_at
        ) AS sub
        WHERE users.id = sub.owner_id
          AND users.telegram_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM users other WHERE other.telegram_id = sub.chat_id)
        """
    )
    op.drop_index("ix_telegram_subscriptions_field_id", table_name="telegram_subscriptions")
    op.drop_table("telegram_subscriptions")

    # Link codes no longer point to a field.
    op.execute("DELETE FROM telegram_tokens WHERE kind = 'link'")
    op.drop_column("telegram_tokens", "field_id")


def downgrade() -> None:
    op.add_column(
        "telegram_tokens",
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_table(
        "telegram_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("chat_id", "field_id", name="uq_telegram_subscriptions_chat_field"),
    )
    op.create_index("ix_telegram_subscriptions_field_id", "telegram_subscriptions", ["field_id"])
    # The downgrade gives every field of a linked owner a subscription to the owner's private chat.
    op.execute(
        """
        INSERT INTO telegram_subscriptions (chat_id, field_id)
        SELECT u.telegram_id, f.id FROM fields f JOIN users u ON u.id = f.owner_id
        WHERE u.telegram_id IS NOT NULL
        """
    )
