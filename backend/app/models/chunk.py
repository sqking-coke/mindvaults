from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, BigInteger, ForeignKey, Float, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models import Base


class KbChunk(Base):
    __tablename__ = "kb_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("kb_documents.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=False)
    page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── 生命周期字段 (#16 #19) ─────────────────────────────
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="document")
    source_insight_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    superseded_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_hit_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    document: Mapped["KbDocument"] = relationship("KbDocument", back_populates="chunks")
