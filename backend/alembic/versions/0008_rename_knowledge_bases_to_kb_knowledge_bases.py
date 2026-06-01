"""rename knowledge_bases to kb_knowledge_bases for kb_ prefix consistency

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-01
"""
from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename table
    op.execute("ALTER TABLE knowledge_bases RENAME TO kb_knowledge_bases")

    # Rename sequence to match
    op.execute("ALTER SEQUENCE knowledge_bases_id_seq RENAME TO kb_knowledge_bases_id_seq")


def downgrade() -> None:
    op.execute("ALTER TABLE kb_knowledge_bases RENAME TO knowledge_bases")
    op.execute("ALTER SEQUENCE kb_knowledge_bases_id_seq RENAME TO knowledge_bases_id_seq")
