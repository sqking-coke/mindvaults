"""add target_kb_id to kb_insights

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kb_insights", sa.Column("target_kb_id", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("kb_insights", "target_kb_id")
