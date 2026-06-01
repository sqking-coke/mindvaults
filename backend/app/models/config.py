from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Float, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class KbConfig(Base):
    __tablename__ = "kb_config"

    # ★ 主键从 id 改为 kb_id (PK + FK)
    kb_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"),
        primary_key=True,
    )

    embedding_dim: Mapped[int] = mapped_column(Integer, default=1024, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    chunk_overlap: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    top_k: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    similarity_threshold: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)

    # LLM 动态配置
    llm_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    llm_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    llm_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    llm_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    llm_temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)

    # --- Embedding config (UI 可配，独立于 LLM) ---
    embedding_provider: Mapped[Optional[str]] = mapped_column(String(50), default="same_as_llm")
    embedding_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    kb: Mapped["KnowledgeBase"] = relationship("KnowledgeBase", back_populates="config")
