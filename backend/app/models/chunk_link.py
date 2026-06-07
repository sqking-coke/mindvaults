"""kb_chunk_links — chunk 间显式关联。

用于记录重复替代、主题关联、碎片簇等 chunk 间关系。
"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbChunkLink(Base):
    __tablename__ = "kb_chunk_links"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    source_chunk_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kb_chunks.id", ondelete="CASCADE"), nullable=False
    )
    target_chunk_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kb_chunks.id", ondelete="CASCADE"), nullable=False
    )

    link_type: Mapped[str] = mapped_column(String(20), nullable=False)  # supersedes / related / cluster

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("source_chunk_id", "target_chunk_id", "link_type"),
    )
