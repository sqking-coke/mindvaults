from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedData


# --- 响应模型 ---

class DocumentResponse(BaseModel):
    """文档详情响应（对齐 KbDocument 模型）。"""

    id: int
    doc_name: str
    doc_type: str
    doc_desc: Optional[str] = None
    file_path: str
    status: int
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListItem(BaseModel):
    """上传响应中的文档摘要。"""

    id: int
    doc_name: str
    status: int
    chunk_count: int
    kb_id: int

    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    documents: list[DocumentListItem]
    total: int


class DocumentListResponse(PaginatedData[DocumentResponse]):
    pass


# --- 请求模型 ---

class DocumentUpdateRequest(BaseModel):
    """PUT /api/v1/kb/documents/{id} 请求体。"""

    doc_name: Optional[str] = Field(None, min_length=1, max_length=255)
    doc_desc: Optional[str] = Field(None, max_length=2000)


class DocumentStatusToggleRequest(BaseModel):
    """PUT /api/v1/kb/documents/{id}/status 请求体。"""

    status: Literal["disabled", "enabled"]


class DocumentStatusToggleResponse(BaseModel):
    """文档状态切换响应。"""

    id: int
    doc_name: str
    status: int
    status_label: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReindexResponse(BaseModel):
    """POST /api/v1/kb/documents/{id}/reindex 响应。"""

    doc_id: int
    doc_name: str
    status: int
    message: str
