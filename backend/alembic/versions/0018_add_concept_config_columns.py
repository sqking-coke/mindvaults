"""add concept extraction config columns to system_config

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-06

— system_config: add concept_extraction_enabled, concept_min_chunk_length,
  concept_max_per_round, concept_summary_max_length
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "system_config",
        sa.Column("concept_extraction_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "system_config",
        sa.Column("concept_min_chunk_length", sa.Integer(), nullable=False, server_default="500"),
    )
    op.add_column(
        "system_config",
        sa.Column("concept_max_per_round", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "system_config",
        sa.Column("concept_summary_max_length", sa.Integer(), nullable=False, server_default="200"),
    )


def downgrade() -> None:
    op.drop_column("system_config", "concept_summary_max_length")
    op.drop_column("system_config", "concept_max_per_round")
    op.drop_column("system_config", "concept_min_chunk_length")
    op.drop_column("system_config", "concept_extraction_enabled")
