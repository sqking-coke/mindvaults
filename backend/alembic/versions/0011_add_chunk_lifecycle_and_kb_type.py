"""add chunk lifecycle fields + kb_type + insight extraction config

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── kb_chunks: lifecycle fields ──────────────────────────
    op.add_column("kb_chunks", sa.Column("status", sa.String(20), nullable=False, server_default="active"))
    op.add_column("kb_chunks", sa.Column("quality_score", sa.Float(), nullable=True))
    op.add_column("kb_chunks", sa.Column("source_type", sa.String(20), nullable=False, server_default="document"))
    op.add_column("kb_chunks", sa.Column("source_insight_id", sa.BigInteger(), nullable=True))
    op.add_column("kb_chunks", sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("kb_chunks", sa.Column("superseded_by", sa.Integer(), nullable=True))
    op.add_column("kb_chunks", sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True))

    # ── kb_knowledge_bases: type discriminator ───────────────
    op.add_column("kb_knowledge_bases", sa.Column("kb_type", sa.String(20), nullable=False, server_default="general"))

    # ── system_config: insight extraction configuration ──────
    op.add_column("system_config", sa.Column("insight_extraction_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("insight_extraction_schedule", sa.String(5), nullable=False, server_default="02:00"))
    op.add_column("system_config", sa.Column("insight_min_answer_length", sa.Integer(), nullable=False, server_default="200"))
    op.add_column("system_config", sa.Column("insight_dedup_threshold", sa.Float(), nullable=False, server_default="0.92"))
    op.add_column("system_config", sa.Column("insight_auto_approve_confidence", sa.Float(), nullable=False, server_default="0.95"))


def downgrade() -> None:
    # system_config
    op.drop_column("system_config", "insight_auto_approve_confidence")
    op.drop_column("system_config", "insight_dedup_threshold")
    op.drop_column("system_config", "insight_min_answer_length")
    op.drop_column("system_config", "insight_extraction_schedule")
    op.drop_column("system_config", "insight_extraction_enabled")

    # kb_knowledge_bases
    op.drop_column("kb_knowledge_bases", "kb_type")

    # kb_chunks
    op.drop_column("kb_chunks", "last_hit_at")
    op.drop_column("kb_chunks", "superseded_by")
    op.drop_column("kb_chunks", "hit_count")
    op.drop_column("kb_chunks", "source_insight_id")
    op.drop_column("kb_chunks", "source_type")
    op.drop_column("kb_chunks", "quality_score")
    op.drop_column("kb_chunks", "status")
