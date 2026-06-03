"""全局系统配置（单行，独立于 KB）。"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, Float, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # LLM 动态配置
    llm_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    llm_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    llm_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    llm_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    llm_temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)

    # Embedding 配置
    embedding_provider: Mapped[Optional[str]] = mapped_column(String(50), default="same_as_llm")
    embedding_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # KB 智能路由阈值
    route_centroid_threshold: Mapped[float] = mapped_column(Float, default=0.40, nullable=False)
    route_centroid_gap: Mapped[float] = mapped_column(Float, default=0.08, nullable=False)
    route_llm_confidence: Mapped[float] = mapped_column(Float, default=0.60, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
