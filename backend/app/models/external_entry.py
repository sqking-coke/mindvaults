"""kb_external_entries — 外部对话暂存表。

Skill 插件推送的对话先存这里，定时提炼后写入 kb_insights。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbExternalEntry(Base):
    __tablename__ = "kb_external_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )

    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    messages_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    source_platform: Mapped[str] = mapped_column(String(50), nullable=False)
    source_session: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # pending / extracted / skipped

    pushed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    extracted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
