"""kb_insights — 对话知识沉淀表。

从 QA 记录中 LLM 提炼的独立知识点，经用户审核后参与检索。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, Float, DateTime, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models import Base


class KbInsight(Base):
    __tablename__ = "kb_insights"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # 审核通过后落地到哪个 KB（预填 session.kb_id，审核时可改）
    target_kb_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1024), nullable=True)

    source_qa_ids: Mapped[list[int]] = mapped_column(ARRAY(BigInteger), nullable=False, default=[])
    source_doc_ids: Mapped[Optional[list[int]]] = mapped_column(ARRAY(BigInteger), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tags: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String(50)), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
