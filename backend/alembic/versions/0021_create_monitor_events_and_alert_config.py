"""create kb_monitor_events and add alert config columns

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── kb_monitor_events ──────────────────────────────────
    op.create_table(
        "kb_monitor_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("event", sa.String(50), nullable=False),
        sa.Column("kb_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("value_int", sa.Integer(), nullable=True),
        sa.Column("value_float", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="success"),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("extra_json", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_monitor_category", "kb_monitor_events", ["category"])
    op.create_index("idx_monitor_event", "kb_monitor_events", ["event"])
    op.create_index("idx_monitor_time", "kb_monitor_events", ["created_at"])
    op.create_index("idx_monitor_kb", "kb_monitor_events", ["kb_id"])
    op.create_index("idx_monitor_status", "kb_monitor_events", ["status"])

    # ── system_config: alert thresholds ────────────────────
    op.add_column("system_config", sa.Column("alert_llm_route_fail_threshold", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("system_config", sa.Column("alert_fallback_rate_threshold", sa.Float(), nullable=False, server_default="0.20"))
    op.add_column("system_config", sa.Column("alert_centroid_fail", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("alert_external_push_fail", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("alert_insight_batch_fail", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("alert_health_scan_fail", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("alert_concept_extraction_fail", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("system_config", sa.Column("alert_slow_call_threshold", sa.Float(), nullable=False, server_default="5.0"))


def downgrade() -> None:
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_slow_call_threshold")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_concept_extraction_fail")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_health_scan_fail")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_insight_batch_fail")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_external_push_fail")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_centroid_fail")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_fallback_rate_threshold")
    op.execute("ALTER TABLE system_config DROP COLUMN IF EXISTS alert_llm_route_fail_threshold")
    op.drop_table("kb_monitor_events")
