"""add status_detail JSONB column to kb_documents

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "kb_documents",
        sa.Column("status_detail", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )


def downgrade():
    op.drop_column("kb_documents", "status_detail")
