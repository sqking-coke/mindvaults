"""kb_insights Pydantic Schema — 对话知识沉淀 API 契约。"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── 请求 ────────────────────────────────────────────────────

class InsightReviewRequest(BaseModel):
    """审核操作请求。审核通过时可指定目标 KB（覆盖预填值）。"""
    status: str = Field(..., pattern="^(approved|rejected)$")
    target_kb_id: int | None = Field(None, description="目标知识库 ID（仅 status=approved 时生效）")


class InsightSaveRequest(BaseModel):
    """手动保存某条 QA 记录为 insight。"""
    qa_record_id: int = Field(..., description="来源 QA 记录 ID")
    kb_id: int = Field(..., description="目标知识库 ID")


# ── 响应 ────────────────────────────────────────────────────

class InsightResponse(BaseModel):
    """单条 insight 响应。"""
    id: int
    kb_id: int
    target_kb_id: int | None = None
    title: str
    content: str
    status: str
    confidence: float
    tags: Optional[list[str]] = None
    source_qa_ids: list[int] = []
    source_doc_ids: Optional[list[int]] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InsightListResponse(BaseModel):
    """insight 分页列表。"""
    items: list[InsightResponse]
    total: int
    page: int
    page_size: int


class InsightExtractionStats(BaseModel):
    """提炼任务统计。"""
    extracted: int = 0
    skipped_short: int = 0
    skipped_duplicate: int = 0
    auto_approved: int = 0
    errors: int = 0
