"""kb_monitor_events — 统一监控事件表。

路由、提炼、外部推送、概念抽取、健康扫描等模块的聚合事件记录，
用于趋势分析和告警。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Float, String, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbMonitorEvent(Base):
    __tablename__ = "kb_monitor_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # 分类: routing / insight / external / concept / health / system
    category: Mapped[str] = mapped_column(String(20), nullable=False)

    # 事件标识: centroid_hit / llm_route_failed / insight_extracted / ...
    event: Mapped[str] = mapped_column(String(50), nullable=False)

    # 关联
    kb_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    # 数值指标
    value_int: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    value_float: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # 状态: success / failed / warning
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")

    # 简短描述
    message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 扩展字段
    extra_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # 告警解除时间（NULL=未解除，非NULL=已解除）
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
