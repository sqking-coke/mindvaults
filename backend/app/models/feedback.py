from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, SmallInteger, Text, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KbFeedback(Base):
    __tablename__ = "kb_feedback"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    qa_record_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("kb_qa_records.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    corrected_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
