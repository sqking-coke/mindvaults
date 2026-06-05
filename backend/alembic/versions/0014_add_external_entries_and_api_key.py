"""add external entries & deposition api key

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-04

— kb_knowledge_bases: add api_key for deposition KB push auth
— kb_external_entries: external dialog staging table for skill plugins
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # — kb_knowledge_bases: api_key —
    op.add_column(
        "kb_knowledge_bases",
        sa.Column("api_key", sa.String(64), nullable=True),
    )
    op.create_index("idx_kb_api_key", "kb_knowledge_bases", ["api_key"], unique=True)

    # — kb_external_entries —
    op.create_table(
        "kb_external_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("kb_id", sa.BigInteger(), sa.ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("messages_json", postgresql.JSONB(), nullable=True),
        sa.Column("source_platform", sa.String(50), nullable=False),
        sa.Column("source_session", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("pushed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_external_entries_kb", "kb_external_entries", ["kb_id"])
    op.create_index("idx_external_entries_status", "kb_external_entries", ["status"])
    op.create_index("idx_external_entries_lookup", "kb_external_entries", ["source_platform", "source_session", "question"])


def downgrade() -> None:
    op.drop_table("kb_external_entries")
    op.drop_index("idx_kb_api_key", table_name="kb_knowledge_bases")
    op.drop_column("kb_knowledge_bases", "api_key")
