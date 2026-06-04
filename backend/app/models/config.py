"""KB 级别 RAG 参数配置（每个 KB 可选覆写，空则走系统默认）。"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class KbConfig(Base):
    __tablename__ = "kb_config"

    kb_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"),
        primary_key=True,
    )

    chunk_size: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    chunk_overlap: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    top_k: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    similarity_threshold: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, default=1024, nullable=False)

    # Embedding 配置（迁移 0009 添加）
    embedding_provider: Mapped[Optional[str]] = mapped_column(String(50), default="same_as_llm")
    embedding_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    kb: Mapped["KnowledgeBase"] = relationship("KnowledgeBase", back_populates="config")
