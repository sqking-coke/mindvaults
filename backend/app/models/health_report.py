"""kb_health_reports — 知识库健康诊断报告。

每次扫描（定时/手动/摄入触发）生成一条报告，记录各维度检测结果。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Float, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbHealthReport(Base):
    __tablename__ = "kb_health_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )

    scan_type: Mapped[str] = mapped_column(String(20), nullable=False)  # scheduled / manual / ingestion
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False)
    duplicate_groups: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_quality: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    outdated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orphans: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fragment_clusters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    health_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)

    details_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
