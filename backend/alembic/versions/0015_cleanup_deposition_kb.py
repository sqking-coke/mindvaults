"""cleanup deposition kb — move api_key to system_config

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-04

— drop api_key from kb_knowledge_bases（不再建独立沉淀 KB）
— add external_api_key to system_config（统一在系统配置管理）
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("idx_kb_api_key", table_name="kb_knowledge_bases")
    op.drop_column("kb_knowledge_bases", "api_key")
    op.add_column(
        "system_config",
        sa.Column("external_api_key", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("system_config", "external_api_key")
    op.add_column(
        "kb_knowledge_bases",
        sa.Column("api_key", sa.String(64), nullable=True),
    )
    op.create_index("idx_kb_api_key", "kb_knowledge_bases", ["api_key"], unique=True)
