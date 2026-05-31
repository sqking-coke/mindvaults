"""add file_size BIGINT column to kb_documents

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "kb_documents",
        sa.Column("file_size", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("kb_documents", "file_size")
