"""Create telegram_subscriptions table

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "telegram_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("chat_id", "field_id", name="uq_telegram_subscriptions_chat_field"),
    )
    op.create_index("ix_telegram_subscriptions_field_id", "telegram_subscriptions", ["field_id"])


def downgrade() -> None:
    op.drop_index("ix_telegram_subscriptions_field_id", table_name="telegram_subscriptions")
    op.drop_table("telegram_subscriptions")
