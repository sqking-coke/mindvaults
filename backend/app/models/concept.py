"""概念/术语关联 — ORM 模型。

kb_concepts: LLM 自动抽取的术语概念及其定义。
kb_chunk_concepts: chunk 与概念的多对多关联表。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Float, String, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models import Base


class KbConcept(Base):
    __tablename__ = "kb_concepts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False)

    # 概念标识
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    aliases: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String(100)), nullable=True)

    # 内容
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 向量
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1024), nullable=True)

    # 来源
    source_chunk_ids: Mapped[Optional[list[int]]] = mapped_column(ARRAY(BigInteger), nullable=True)

    # 状态
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="auto")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关联
    chunk_links: Mapped[list["KbChunkConcept"]] = relationship(
        "KbChunkConcept", back_populates="concept", cascade="all, delete-orphan"
    )


class KbChunkConcept(Base):
    __tablename__ = "kb_chunk_concepts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chunk_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("kb_chunks.id", ondelete="CASCADE"), nullable=False)
    concept_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("kb_concepts.id", ondelete="CASCADE"), nullable=False)
    relevance: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    position: Mapped[Optional[list[int]]] = mapped_column(ARRAY(Integer), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    concept: Mapped["KbConcept"] = relationship("KbConcept", back_populates="chunk_links")

    __table_args__ = (
        UniqueConstraint("chunk_id", "concept_id"),
    )
