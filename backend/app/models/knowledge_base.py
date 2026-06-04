from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models import Base


class KnowledgeBase(Base):
    __tablename__ = "kb_knowledge_bases"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # KB 类型：general（普通）/ deposition（沉淀库）
    kb_type: Mapped[str] = mapped_column(String(20), nullable=False, default="general")

    # KB 智能路由：质心向量（Layer 1 匹配用）
    centroid_embedding: Mapped[Optional[list[float]]] = mapped_column(
        Vector(1024), nullable=True
    )
    centroid_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    config: Mapped["KbConfig"] = relationship(
        "KbConfig", back_populates="kb", uselist=False
    )
    documents: Mapped[list["KbDocument"]] = relationship(
        "KbDocument", back_populates="kb"
    )
    sessions: Mapped[list["KbSession"]] = relationship(
        "KbSession", back_populates="kb"
    )
