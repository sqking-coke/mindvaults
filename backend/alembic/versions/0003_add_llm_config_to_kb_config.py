"""Add LLM configuration columns to kb_config

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kb_config", sa.Column("llm_provider", sa.String(length=50), nullable=True))
    op.add_column("kb_config", sa.Column("llm_base_url", sa.String(length=255), nullable=True))
    op.add_column("kb_config", sa.Column("llm_model", sa.String(length=100), nullable=True))
    op.add_column("kb_config", sa.Column("llm_api_key", sa.String(length=255), nullable=True))
    op.add_column("kb_config", sa.Column("llm_temperature", sa.Float(), nullable=False, server_default="0.3"))
    op.add_column("kb_config", sa.Column("system_prompt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("kb_config", "system_prompt")
    op.drop_column("kb_config", "llm_temperature")
    op.drop_column("kb_config", "llm_api_key")
    op.drop_column("kb_config", "llm_model")
    op.drop_column("kb_config", "llm_base_url")
    op.drop_column("kb_config", "llm_provider")
