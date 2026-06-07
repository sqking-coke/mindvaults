from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedData


# --- 列表项 ---

class ChunkItem(BaseModel):
    """GET /api/v1/kb/documents/{id}/chunks 列表项。"""

    id: int
    chunk_index: int
    content: str
    page: Optional[int] = None
    status: str = "active"
    created_at: datetime

    model_config = {"from_attributes": True}


class ChunkListResponse(PaginatedData[ChunkItem]):
    pass


# --- 编辑 ---

class ChunkUpdateRequest(BaseModel):
    """PUT /api/v1/kb/chunks/{id} 请求体。"""

    content: str = Field(..., min_length=1, max_length=10000)


class ChunkUpdateResponse(BaseModel):
    """PUT /api/v1/kb/chunks/{id} 响应。"""

    id: int
    chunk_index: int
    content: str
    page: Optional[int] = None
    updated_at: datetime

    model_config = {"from_attributes": True}
