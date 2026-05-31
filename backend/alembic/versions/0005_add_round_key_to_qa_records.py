"""add round_key column to kb_qa_records

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "kb_qa_records",
        sa.Column("round_key", sa.String(16), nullable=True),
    )


def downgrade():
    op.drop_column("kb_qa_records", "round_key")
