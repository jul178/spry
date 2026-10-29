"""add agenda and ai_suggestion columns to meetings

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-29

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("agenda", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "meetings",
        sa.Column("ai_suggestion", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "ai_suggestion")
    op.drop_column("meetings", "agenda")
