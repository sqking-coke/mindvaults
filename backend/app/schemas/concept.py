"""kb_concepts Pydantic Schema — 概念术语关联 API 契约。"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedData


# ── 请求 ────────────────────────────────────────────────────

class ConceptUpdateRequest(BaseModel):
    """更新概念定义或别名。"""
    definition: Optional[str] = Field(None, max_length=2000)
    summary: Optional[str] = Field(None, max_length=500)
    aliases: Optional[list[str]] = Field(None)
    status: Optional[str] = Field(None, pattern="^(auto|confirmed|edited)$")


class ConceptManualCreateRequest(BaseModel):
    """手动创建概念。"""
    kb_id: int
    name: str = Field(..., min_length=1, max_length=200)
    definition: str = Field(..., min_length=1, max_length=2000)
    summary: Optional[str] = Field(None, max_length=500)
    aliases: Optional[list[str]] = Field(None)
    status: str = Field("manual", pattern="^(manual|confirmed)$")


# ── 响应 ────────────────────────────────────────────────────

class ConceptChunkRef(BaseModel):
    """概念引用的 chunk 摘要（用于概念详情页反向链接展示）。"""
    chunk_id: int
    doc_name: str
    content_preview: str   # 前 200 字
    relevance: float
    page: Optional[int] = None

    model_config = {"from_attributes": True}


class ConceptResponse(BaseModel):
    """单条概念响应。"""
    id: int
    kb_id: int
    name: str
    aliases: Optional[list[str]] = None
    definition: str
    summary: Optional[str] = None
    status: str
    confidence: float
    source_chunk_ids: Optional[list[int]] = None
    chunk_count: int = 0           # 引用该概念的 chunk 总数
    related_concepts: list[str] = []   # 共现最频繁的相关概念名
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConceptWithChunksResponse(ConceptResponse):
    """概念详情 + 引用 chunk 列表。"""
    chunks: list[ConceptChunkRef] = []


class ConceptListData(PaginatedData[ConceptResponse]):
    pass
