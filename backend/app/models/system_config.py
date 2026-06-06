"""全局系统配置（单行，独立于 KB）。"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, Boolean, Float, String, Text, DateTime, func
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

    # 对话知识沉淀配置 (#16)
    insight_extraction_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    insight_extraction_schedule: Mapped[str] = mapped_column(String(5), default="02:00", nullable=False)
    insight_min_answer_length: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    insight_dedup_threshold: Mapped[float] = mapped_column(Float, default=0.92, nullable=False)
    insight_auto_approve_confidence: Mapped[float] = mapped_column(Float, default=0.95, nullable=False)

    # 概念术语关联配置 (#18)
    concept_extraction_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    concept_min_chunk_length: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    concept_max_per_round: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    concept_summary_max_length: Mapped[int] = mapped_column(Integer, default=200, nullable=False)

    # 外部 Skill 插件推送认证 Key
    external_api_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
