from typing import Optional
from pydantic import BaseModel, Field


class SystemConfigResponse(BaseModel):
    """全局系统配置响应（LLM + Embedding + system_prompt）。"""
    llm_provider: Optional[str] = Field(None, description="大模型厂商 (ollama / openai)")
    llm_base_url: Optional[str] = Field(None, description="API 基质接口端点")
    llm_model: Optional[str] = Field(None, description="推理模型代号")
    llm_api_key: Optional[str] = Field(None, description="API 密钥 (已脱敏)")
    llm_temperature: float = Field(0.3, description="生成温度")

    embedding_provider: Optional[str] = Field(None, description="Embedding 供应商")
    embedding_base_url: Optional[str] = Field(None, description="Embedding API 基础 URL")
    embedding_model: Optional[str] = Field(None, description="Embedding 模型代号")
    embedding_api_key: Optional[str] = Field(None, description="Embedding API 密钥 (已脱敏)")

    system_prompt: Optional[str] = Field(None, description="系统自定义提示词模板")

    # KB 智能路由阈值
    route_centroid_threshold: float = Field(0.40, description="Layer 1 质心匹配阈值（余弦距离）")
    route_centroid_gap: float = Field(0.08, description="Layer 1 前两名最小差距阈值")
    route_llm_confidence: float = Field(0.60, description="Layer 2 LLM 路由置信度阈值")

    class Config:
        from_attributes = True


class SystemConfigRequest(BaseModel):
    """全局系统配置请求。"""
    llm_provider: Optional[str] = Field(None, max_length=50)
    llm_base_url: Optional[str] = Field(None, max_length=255)
    llm_model: Optional[str] = Field(None, max_length=100)
    llm_api_key: Optional[str] = Field(None, max_length=255)
    llm_temperature: Optional[float] = Field(None, ge=0.0, le=2.0)

    embedding_provider: Optional[str] = Field(None, max_length=50)
    embedding_base_url: Optional[str] = Field(None, max_length=255)
    embedding_model: Optional[str] = Field(None, max_length=100)
    embedding_api_key: Optional[str] = Field(None, max_length=255)

    system_prompt: Optional[str] = Field(None)

    # KB 智能路由阈值
    route_centroid_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    route_centroid_gap: Optional[float] = Field(None, ge=0.0, le=1.0)
    route_llm_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
