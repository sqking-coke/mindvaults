from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.knowledge_base import KnowledgeBase  # noqa: E402, F401
from app.models.config import KbConfig  # noqa: E402, F401
from app.models.document import KbDocument, DOC_STATUS_FAILED, DOC_STATUS_PROCESSING, DOC_STATUS_COMPLETED  # noqa: E402, F401
from app.models.chunk import KbChunk  # noqa: E402, F401
from app.models.session import KbSession  # noqa: E402, F401
from app.models.qa_record import KbQaRecord  # noqa: E402, F401
from app.models.data_source import KbDataSource  # noqa: E402, F401
from app.models.raw_entry import KbRawEntry  # noqa: E402, F401
from app.models.feedback import KbFeedback  # noqa: E402, F401

__all__ = [
    "Base",
    "KnowledgeBase",
    "KbConfig",
    "KbDocument", "DOC_STATUS_FAILED", "DOC_STATUS_PROCESSING", "DOC_STATUS_COMPLETED",
    "KbChunk",
    "KbSession",
    "KbQaRecord",
    "KbDataSource",
    "KbRawEntry",
    "KbFeedback",
]
