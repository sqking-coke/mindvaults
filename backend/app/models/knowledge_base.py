from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
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
