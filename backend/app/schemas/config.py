from typing import Optional
from pydantic import BaseModel, Field


class SystemConfigResponse(BaseModel):
    # --- RAG parameters ---
    chunk_size: int = Field(500, description="切片字数大小")
    chunk_overlap: int = Field(50, description="切片重叠字数")
    top_k: int = Field(5, description="召回最大分块数")
    similarity_threshold: float = Field(0.7, description="向量召回相似度阈值")
    embedding_dim: int = Field(1024, description="向量维度")

    # --- LLM parameters ---
    llm_provider: Optional[str] = Field(None, description="大模型厂商 (ollama / openai)")
    llm_base_url: Optional[str] = Field(None, description="API 基质接口端点")
    llm_model: Optional[str] = Field(None, description="推理模型代号")
    llm_api_key: Optional[str] = Field(None, description="API 密钥 (已脱敏)")
    llm_temperature: float = Field(0.3, description="生成温度")

    # --- Embedding parameters ---
    embedding_provider: Optional[str] = Field(None, description="Embedding 供应商 (same_as_llm / openai / ollama / custom)")
    embedding_base_url: Optional[str] = Field(None, description="Embedding API 基础 URL")
    embedding_model: Optional[str] = Field(None, description="Embedding 模型代号")
    embedding_api_key: Optional[str] = Field(None, description="Embedding API 密钥 (已脱敏)")

    system_prompt: Optional[str] = Field(None, description="系统自定义提示词模板")

    class Config:
        from_attributes = True


class SystemConfigRequest(BaseModel):
    # --- RAG parameters ---
    chunk_size: Optional[int] = Field(None, ge=10, le=5000)
    chunk_overlap: Optional[int] = Field(None, ge=0, le=1000)
    top_k: Optional[int] = Field(None, ge=1, le=50)
    similarity_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)

    # --- LLM parameters ---
    llm_provider: Optional[str] = Field(None, max_length=50)
    llm_base_url: Optional[str] = Field(None, max_length=255)
    llm_model: Optional[str] = Field(None, max_length=100)
    llm_api_key: Optional[str] = Field(None, max_length=255)
    llm_temperature: Optional[float] = Field(None, ge=0.0, le=2.0)

    # --- Embedding parameters ---
    embedding_provider: Optional[str] = Field(None, max_length=50)
    embedding_base_url: Optional[str] = Field(None, max_length=255)
    embedding_model: Optional[str] = Field(None, max_length=100)
    embedding_api_key: Optional[str] = Field(None, max_length=255)

    system_prompt: Optional[str] = Field(None)
