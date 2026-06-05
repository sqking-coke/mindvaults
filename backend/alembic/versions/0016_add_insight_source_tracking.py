"""add insight source tracking for external entries

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-05

— kb_insights: add source_type + external_entry_ids for external dialog traceability
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "kb_insights",
        sa.Column("source_type", sa.String(20), nullable=False, server_default="native"),
    )
    op.add_column(
        "kb_insights",
        sa.Column("external_entry_ids", postgresql.ARRAY(sa.BigInteger()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("kb_insights", "external_entry_ids")
    op.drop_column("kb_insights", "source_type")
