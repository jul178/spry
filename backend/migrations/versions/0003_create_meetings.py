"""create meetings table

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "category",
            sa.String(length=50),
            server_default="sync",
            nullable=False,
        ),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "attendee_count",
            sa.Integer(),
            server_default="2",
            nullable=False,
        ),
        sa.Column(
            "hourly_rate_usd",
            sa.Numeric(precision=10, scale=2),
            server_default="65.00",
            nullable=False,
        ),
        sa.Column(
            "estimated_cost_usd",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meetings_start_time", "meetings", ["start_time"])


def downgrade() -> None:
    op.drop_index("ix_meetings_start_time", table_name="meetings")
    op.drop_table("meetings")
