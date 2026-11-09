"""Create users, auth_sessions and telegram_tokens tables, and add fields.owner_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(32), nullable=True, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=True, unique=True),
        sa.Column("telegram_username", sa.String(64), nullable=True),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    op.create_table(
        "telegram_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("poll_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("field_id", sa.Integer(), sa.ForeignKey("fields.id", ondelete="CASCADE"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Nullable: fields from before this migration have no owner until the first user registers.
    op.add_column(
        "fields",
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_fields_owner_id", "fields", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_fields_owner_id", table_name="fields")
    op.drop_column("fields", "owner_id")
    op.drop_table("telegram_tokens")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_table("users")
