"""multi KB support: knowledge_bases table + kb_id columns + extension tables

Revision ID: 0004
Revises: 897e57cfd17b
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import func

revision = '0004'
down_revision = '897e57cfd17b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ═══ Step 1: knowledge_bases 表 ═══
    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # ═══ Step 2: 默认知识库 ═══
    op.execute(
        "INSERT INTO knowledge_bases (id, name, description) "
        "VALUES (1, '默认知识库', '系统默认知识库。')"
    )
    op.execute("SELECT setval('knowledge_bases_id_seq', 1, true)")

    # ═══ Step 3: kb_documents + kb_id + source ═══
    op.add_column("kb_documents", sa.Column("kb_id", sa.BigInteger(), nullable=True))
    op.add_column("kb_documents", sa.Column("source", sa.String(50), nullable=True))
    op.execute("UPDATE kb_documents SET kb_id = 1 WHERE kb_id IS NULL")
    op.alter_column("kb_documents", "kb_id", nullable=False)
    op.create_index("idx_documents_kb_id", "kb_documents", ["kb_id"])
    op.create_foreign_key(
        "fk_documents_kb", "kb_documents", "knowledge_bases",
        ["kb_id"], ["id"], ondelete="CASCADE"
    )

    # ═══ Step 4: kb_config 重构 id → kb_id 主键 ═══
    op.add_column("kb_config", sa.Column("kb_id", sa.BigInteger(), nullable=True))
    op.execute("UPDATE kb_config SET kb_id = 1 WHERE id = 1 AND kb_id IS NULL")
    op.execute("ALTER TABLE kb_config DROP CONSTRAINT IF EXISTS kb_config_pkey")
    op.execute("ALTER TABLE kb_config DROP CONSTRAINT IF EXISTS kb_config_pkey1")
    op.create_primary_key("pk_kb_config", "kb_config", ["kb_id"])
    op.create_foreign_key(
        "fk_config_kb", "kb_config", "knowledge_bases",
        ["kb_id"], ["id"], ondelete="CASCADE"
    )
    op.drop_column("kb_config", "id")

    # ═══ Step 5: kb_sessions + kb_id ═══
    op.add_column("kb_sessions", sa.Column("kb_id", sa.BigInteger(), nullable=True))
    op.execute("UPDATE kb_sessions SET kb_id = 1 WHERE kb_id IS NULL")
    op.alter_column("kb_sessions", "kb_id", nullable=False)
    op.create_index("idx_sessions_kb", "kb_sessions", ["kb_id"])
    op.create_foreign_key(
        "fk_sessions_kb", "kb_sessions", "knowledge_bases",
        ["kb_id"], ["id"], ondelete="CASCADE"
    )

    # ═══ Step 6: 预留扩展表 ═══
    op.create_table(
        "kb_data_sources",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("kb_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("endpoint_url", sa.Text(), nullable=False),
        sa.Column("cron_expr", sa.String(100), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["kb_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "kb_raw_entries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_id", sa.BigInteger(), nullable=False),
        sa.Column("kb_id", sa.BigInteger(), nullable=False),
        sa.Column("raw_content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("cleaned_content", sa.Text(), nullable=True),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=func.now()),
        sa.Column("cleaned_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["source_id"], ["kb_data_sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["kb_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_raw_status", "kb_raw_entries", ["status"])

    op.create_table(
        "kb_feedback",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("qa_record_id", sa.BigInteger(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("corrected_answer", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["qa_record_id"], ["kb_qa_records.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_feedback_qa", "kb_feedback", ["qa_record_id"])


def downgrade() -> None:
    op.drop_table("kb_feedback")
    op.drop_table("kb_raw_entries")
    op.drop_table("kb_data_sources")

    op.drop_constraint("fk_sessions_kb", "kb_sessions")
    op.drop_index("idx_sessions_kb", "kb_sessions")
    op.drop_column("kb_sessions", "kb_id")

    op.add_column("kb_config", sa.Column("id", sa.Integer(), autoincrement=True))
    op.execute("UPDATE kb_config SET id = kb_id")
    op.execute("ALTER TABLE kb_config DROP CONSTRAINT IF EXISTS pk_kb_config")
    op.execute("ALTER TABLE kb_config ADD PRIMARY KEY (id)")
    op.drop_constraint("fk_config_kb", "kb_config")
    op.drop_column("kb_config", "kb_id")

    op.drop_constraint("fk_documents_kb", "kb_documents")
    op.drop_index("idx_documents_kb_id", "kb_documents")
    op.drop_column("kb_documents", "source")
    op.drop_column("kb_documents", "kb_id")

    op.drop_table("knowledge_bases")
