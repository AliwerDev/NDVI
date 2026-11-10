"""Create weather_daily table

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "weather_daily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("t_max", sa.Float(), nullable=True),
        sa.Column("t_min", sa.Float(), nullable=True),
        sa.Column("precipitation", sa.Float(), nullable=True),
        sa.Column("et0", sa.Float(), nullable=True),
        sa.Column("wind_max", sa.Float(), nullable=True),
        sa.Column("is_forecast", sa.Boolean(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("lat", "lon", "day", name="uq_weather_daily_cell_day"),
    )


def downgrade() -> None:
    op.drop_table("weather_daily")
