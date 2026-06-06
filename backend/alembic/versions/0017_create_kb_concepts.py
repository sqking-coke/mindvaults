"""create kb_concepts + kb_chunk_concepts tables

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-06

— kb_concepts: term definitions extracted by LLM from chunks, with pgvector embedding
— kb_chunk_concepts: many-to-many junction between chunks and concepts
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. kb_concepts
    op.create_table(
        "kb_concepts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("kb_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("aliases", postgresql.ARRAY(sa.String(100)), nullable=True),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column("source_chunk_ids", postgresql.ARRAY(sa.BigInteger()), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="auto"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["kb_id"], ["kb_knowledge_bases.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_concepts_kb", "kb_concepts", ["kb_id"])
    op.create_index("idx_concepts_kb_name", "kb_concepts", ["kb_id", sa.text("LOWER(name)")], unique=True)
    op.create_index(
        "idx_concepts_embedding_hnsw",
        "kb_concepts",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 200},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # 2. kb_chunk_concepts junction table
    op.create_table(
        "kb_chunk_concepts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("chunk_id", sa.BigInteger(), nullable=False),
        sa.Column("concept_id", sa.BigInteger(), nullable=False),
        sa.Column("relevance", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("position", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["chunk_id"], ["kb_chunks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["concept_id"], ["kb_concepts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("chunk_id", "concept_id"),
    )
    op.create_index("idx_chunk_concepts_chunk", "kb_chunk_concepts", ["chunk_id"])
    op.create_index("idx_chunk_concepts_concept", "kb_chunk_concepts", ["concept_id"])


def downgrade() -> None:
    op.drop_table("kb_chunk_concepts")
    op.drop_table("kb_concepts")
