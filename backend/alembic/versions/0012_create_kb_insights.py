"""create kb_insights table

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kb_insights",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("kb_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column("source_qa_ids", sa.ARRAY(sa.BigInteger()), nullable=False, server_default="{}"),
        sa.Column("source_doc_ids", sa.ARRAY(sa.BigInteger()), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("tags", sa.ARRAY(sa.String(50)), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["kb_id"], ["kb_knowledge_bases.id"], ondelete="CASCADE"),
    )

    op.create_index("idx_insights_kb", "kb_insights", ["kb_id"])
    op.create_index("idx_insights_status", "kb_insights", ["status"])

    # HNSW vector index
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_insights_embedding_hnsw ON kb_insights "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200)"
    )


def downgrade() -> None:
    op.drop_index("idx_insights_embedding_hnsw", table_name="kb_insights")
    op.drop_index("idx_insights_status", table_name="kb_insights")
    op.drop_index("idx_insights_kb", table_name="kb_insights")
    op.drop_table("kb_insights")
