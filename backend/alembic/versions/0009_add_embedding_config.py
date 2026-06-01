"""add embedding_config columns to kb_config

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kb_config", sa.Column("embedding_provider", sa.String(50), server_default="same_as_llm"))
    op.add_column("kb_config", sa.Column("embedding_base_url", sa.String(255), nullable=True))
    op.add_column("kb_config", sa.Column("embedding_api_key", sa.String(255), nullable=True))
    op.add_column("kb_config", sa.Column("embedding_model", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("kb_config", "embedding_model")
    op.drop_column("kb_config", "embedding_api_key")
    op.drop_column("kb_config", "embedding_base_url")
    op.drop_column("kb_config", "embedding_provider")
