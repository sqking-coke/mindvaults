from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedData


# --- RefChunk（对齐前端 RefChunk） ---

class RefChunk(BaseModel):
    chunk_id: int
    doc_name: str
    content: str
    similarity: float
    page: Optional[int] = None

    model_config = {"from_attributes": True}


# --- 请求模型 ---

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=5000)
    session_id: str = Field(..., min_length=1, max_length=36)
    kb_id: int | None = Field(None, description="知识库 ID，不传则使用会话绑定的 KB")


# --- 响应模型 ---

class ChatHistoryRecord(BaseModel):
    id: int
    question: str
    answer: str
    ref_chunks: list[RefChunk]
    model_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(PaginatedData[ChatHistoryRecord]):
    pass


class SessionItem(BaseModel):
    id: int
    session_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionsListResponse(BaseModel):
    sessions: list[SessionItem]
