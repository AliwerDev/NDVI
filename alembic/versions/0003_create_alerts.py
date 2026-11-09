"""Create alerts table

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "observation_id",
            sa.Integer(),
            sa.ForeignKey("ndvi_observations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "previous_observation_id",
            sa.Integer(),
            sa.ForeignKey("ndvi_observations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_mean", sa.Float(), nullable=False),
        sa.Column("current_mean", sa.Float(), nullable=False),
        sa.Column("drop", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_alerts_field_id", "alerts", ["field_id"])


def downgrade() -> None:
    op.drop_index("ix_alerts_field_id", table_name="alerts")
    op.drop_table("alerts")
