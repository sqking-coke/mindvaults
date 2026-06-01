from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbRawEntry(Base):
    __tablename__ = "kb_raw_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_data_sources.id", ondelete="CASCADE"), nullable=False
    )
    kb_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    cleaned_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    cleaned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
