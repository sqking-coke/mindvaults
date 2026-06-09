"""add resolved_at to kb_monitor_events

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kb_monitor_events", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("idx_monitor_resolved", "kb_monitor_events", ["resolved_at"])


def downgrade() -> None:
    op.drop_index("idx_monitor_resolved")
    op.drop_column("kb_monitor_events", "resolved_at")
