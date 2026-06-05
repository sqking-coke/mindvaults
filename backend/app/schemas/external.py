"""外部对话推送 API Schema — Skill 插件入口。"""

from pydantic import BaseModel, Field


# ── 请求 ────────────────────────────────────────────────────

class QAPairItem(BaseModel):
    """单条 QA 对（空字符串由服务层跳过，不在 Schema 层拒绝）。"""
    question: str = Field(..., description="用户问题")
    answer: str = Field(..., description="助手回答")


class ExternalPushRequest(BaseModel):
    """Skill 插件推送请求。"""
    platform: str = Field(..., description="来源平台: claude_code / copilot / chatgpt")
    session_id: str | None = Field(None, description="外部平台会话 ID")
    qa_pairs: list[QAPairItem] = Field(..., min_length=1, max_length=50, description="QA 对列表")
    messages_json: dict | None = Field(None, description="完整多轮消息（可选）")


# ── 响应 ────────────────────────────────────────────────────

class ExternalPushResponse(BaseModel):
    """推送响应。"""
    received: int = Field(..., description="成功接收条数")
    skipped: int = Field(0, description="去重跳过的条数")
    rejected: int = Field(0, description="质量门拦截的条数")
    entry_ids: list[int] = Field(default_factory=list, description="创建的 entry ID")


class DepositionConfigResponse(BaseModel):
    """外部推送配置（含 API Key 和统计）。"""
    kb_id: int
    kb_name: str = ""
    api_key: str | None = None
    entry_count: int = 0
    pending_insights: int = 0
    endpoint: str = ""


class KeyRotateResponse(BaseModel):
    """API Key 轮换响应。"""
    api_key: str


class ExternalEntryItem(BaseModel):
    """单条外部对话记录。"""
    id: int
    kb_id: int
    question: str
    answer: str
    source_platform: str
    source_session: str | None = None
    status: str
    pushed_at: str
    created_at: str

    model_config = {"from_attributes": True}


class ExternalEntryListResponse(BaseModel):
    """外部对话分页列表。"""
    items: list[ExternalEntryItem]
    total: int
    page: int
    page_size: int
