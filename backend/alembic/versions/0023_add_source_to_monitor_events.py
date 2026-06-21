"""add source column to kb_monitor_events

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-11

区分事件来源：web / mcp / scheduler
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "kb_monitor_events",
        sa.Column("source", sa.String(20), server_default="web", nullable=False),
    )
    op.create_index("idx_monitor_source", "kb_monitor_events", ["source"])


def downgrade() -> None:
    op.drop_index("idx_monitor_source", "kb_monitor_events")
    op.drop_column("kb_monitor_events", "source")
