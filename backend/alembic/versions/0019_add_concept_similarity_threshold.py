"""add concept_similarity_threshold to system_config

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-06

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "system_config",
        sa.Column(
            "concept_similarity_threshold",
            sa.Float(),
            nullable=False,
            server_default="0.85",
        ),
    )


def downgrade() -> None:
    op.drop_column("system_config", "concept_similarity_threshold")
