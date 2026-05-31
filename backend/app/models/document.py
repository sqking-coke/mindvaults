from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base

# 文档摄入状态常量
DOC_STATUS_FAILED = 0       # 摄入失败
DOC_STATUS_PROCESSING = 1   # 摄入处理中 / 待处理
DOC_STATUS_COMPLETED = 2    # 摄入完成，可检索
DOC_STATUS_DISABLED = 3     # 人工禁用


class KbDocument(Base):
    __tablename__ = "kb_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    doc_name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(10), nullable=False)
    doc_desc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[int] = mapped_column(Integer, default=DOC_STATUS_PROCESSING, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status_detail: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    kb: Mapped["KnowledgeBase"] = relationship("KnowledgeBase", back_populates="documents")
    chunks: Mapped[list["KbChunk"]] = relationship("KbChunk", back_populates="document")
