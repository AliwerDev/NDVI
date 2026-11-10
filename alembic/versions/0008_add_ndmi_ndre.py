"""Add NDMI and NDRE columns, and alert kinds

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_COLUMNS = ("ndmi_mean", "ndmi_min", "ndmi_max", "ndre_mean", "ndre_min", "ndre_max")


def upgrade() -> None:
    for name in INDEX_COLUMNS:
        op.add_column("ndvi_observations", sa.Column(name, sa.Float(), nullable=True))

    op.add_column("alerts", sa.Column("kind", sa.String(20), server_default="ndvi_drop", nullable=False))
    # 0003 made observation_id unique. PostgreSQL named that constraint "alerts_observation_id_key".
    op.drop_constraint("alerts_observation_id_key", "alerts", type_="unique")
    op.create_unique_constraint("uq_alerts_observation_kind", "alerts", ["observation_id", "kind"])
    # A water stress or nitrogen alert can come from a single observation, without a previous one.
    op.alter_column("alerts", "previous_observation_id", nullable=True)
    op.alter_column("alerts", "previous_mean", nullable=True)
    op.alter_column("alerts", "drop", nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM alerts WHERE kind <> 'ndvi_drop'")
    op.alter_column("alerts", "drop", nullable=False)
    op.alter_column("alerts", "previous_mean", nullable=False)
    op.alter_column("alerts", "previous_observation_id", nullable=False)
    op.drop_constraint("uq_alerts_observation_kind", "alerts", type_="unique")
    op.create_unique_constraint("alerts_observation_id_key", "alerts", ["observation_id"])
    op.drop_column("alerts", "kind")

    for name in reversed(INDEX_COLUMNS):
        op.drop_column("ndvi_observations", name)
