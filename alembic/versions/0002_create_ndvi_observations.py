"""Create ndvi_observations table

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ndvi_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "field_id",
            sa.Integer(),
            sa.ForeignKey("fields.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("scene_id", sa.String(100), nullable=False),
        sa.Column("scene_cloud_cover", sa.Float(), nullable=False),
        sa.Column("ndvi_mean", sa.Float(), nullable=False),
        sa.Column("ndvi_min", sa.Float(), nullable=False),
        sa.Column("ndvi_max", sa.Float(), nullable=False),
        sa.Column("clear_fraction", sa.Float(), nullable=False),
        sa.Column("cog_path", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        # The unique index also serves queries by field_id.
        sa.UniqueConstraint("field_id", "observed_on", name="uq_ndvi_observations_field_date"),
    )


def downgrade() -> None:
    op.drop_table("ndvi_observations")
