"""知识库 CRUD 请求/响应 Schema。"""
from datetime import datetime

from pydantic import BaseModel, Field


class KbCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="知识库名称")
    description: str = Field(default="", description="描述")


class KbUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class KbInfo(BaseModel):
    id: int
    name: str
    description: str = ""
    doc_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KbListResponse(BaseModel):
    items: list[KbInfo]
    total: int


# --- KB 级配置 ---

class KbConfigResponse(BaseModel):
    kb_id: int
    chunk_size: int
    chunk_overlap: int
    top_k: int
    similarity_threshold: float
    embedding_dim: int
    llm_provider: str | None
    llm_base_url: str | None
    llm_model: str | None
    llm_api_key: str | None  # 脱敏后
    llm_temperature: float
    system_prompt: str | None

    model_config = {"from_attributes": True}


class KbConfigRequest(BaseModel):
    chunk_size: int | None = None
    chunk_overlap: int | None = None
    top_k: int | None = None
    similarity_threshold: float | None = None
    llm_provider: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_temperature: float | None = None
    system_prompt: str | None = None
    embedding_provider: str | None = None
    embedding_base_url: str | None = None
    embedding_model: str | None = None
    embedding_api_key: str | None = None
