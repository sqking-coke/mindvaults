"""create kb_health_reports and kb_chunk_links

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── kb_health_reports ──────────────────────────────────
    op.create_table(
        "kb_health_reports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("kb_id", sa.BigInteger(), sa.ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scan_type", sa.String(20), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("total_chunks", sa.Integer(), nullable=False),
        sa.Column("duplicate_groups", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("low_quality", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("outdated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orphans", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fragment_clusters", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("health_score", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("details_json", JSONB(), nullable=False, server_default="{}"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_health_reports_kb", "kb_health_reports", ["kb_id"])
    op.create_index("idx_health_reports_kb_time", "kb_health_reports", ["kb_id", "scanned_at"], postgresql_using="btree")

    # ── kb_chunk_links ─────────────────────────────────────
    op.create_table(
        "kb_chunk_links",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("kb_id", sa.BigInteger(), sa.ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_chunk_id", sa.Integer(), sa.ForeignKey("kb_chunks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_chunk_id", sa.Integer(), sa.ForeignKey("kb_chunks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("link_type", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source_chunk_id", "target_chunk_id", "link_type"),
    )
    op.create_index("idx_chunk_links_source", "kb_chunk_links", ["source_chunk_id"])
    op.create_index("idx_chunk_links_target", "kb_chunk_links", ["target_chunk_id"])


def downgrade() -> None:
    op.drop_table("kb_chunk_links")
    op.drop_table("kb_health_reports")
