"""add centroid_embedding to kb_knowledge_bases + route thresholds to system_config

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # kb_knowledge_bases: centroid for Layer 1 KB routing
    op.add_column("kb_knowledge_bases", sa.Column("centroid_embedding", Vector(1024), nullable=True))
    op.add_column("kb_knowledge_bases", sa.Column("centroid_updated_at", sa.DateTime(timezone=True), nullable=True))

    # system_config: routing thresholds
    op.add_column("system_config", sa.Column("route_centroid_threshold", sa.Float(), nullable=False, server_default="0.40"))
    op.add_column("system_config", sa.Column("route_centroid_gap", sa.Float(), nullable=False, server_default="0.08"))
    op.add_column("system_config", sa.Column("route_llm_confidence", sa.Float(), nullable=False, server_default="0.60"))


def downgrade() -> None:
    op.drop_column("system_config", "route_llm_confidence")
    op.drop_column("system_config", "route_centroid_gap")
    op.drop_column("system_config", "route_centroid_threshold")

    op.drop_column("kb_knowledge_bases", "centroid_updated_at")
    op.drop_column("kb_knowledge_bases", "centroid_embedding")
