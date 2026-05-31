from datetime import datetime

from sqlalchemy import Integer, ForeignKey, Text, String, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class KbQaRecord(Base):
    __tablename__ = "kb_qa_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("kb_sessions.id"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    ref_chunks: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    round_key: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["KbSession"] = relationship("KbSession", back_populates="qa_records")
