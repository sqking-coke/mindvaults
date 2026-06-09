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

    # 对话知识沉淀配置
    insight_extraction_enabled: bool = Field(True, description="启用对话知识提炼")
    insight_extraction_schedule: str = Field("02:00", description="批处理触发时间 (HH:MM)")
    insight_min_answer_length: int = Field(200, description="答案最少字符数阈值")
    insight_dedup_threshold: float = Field(0.92, description="向量去重相似度阈值")
    insight_auto_approve_confidence: float = Field(0.95, description="自动通过的置信度阈值")

    # 概念术语关联配置
    concept_extraction_enabled: bool = Field(True, description="启用概念自动抽取")
    concept_min_chunk_length: int = Field(500, description="小于此长度的 chunk 跳过抽取")
    concept_max_per_round: int = Field(5, description="每轮 RAG 最多注入几个概念")
    concept_summary_max_length: int = Field(200, description="注入上下文时的摘要最大字符数")

    # 监控告警配置
    alert_llm_route_fail_threshold: int = Field(3, description="LLM 路由连续失败 N 次告警")
    alert_fallback_rate_threshold: float = Field(0.20, description="Layer 3 降级率告警阈值")
    alert_centroid_fail: bool = Field(True, description="质心计算失败立即告警")
    alert_external_push_fail: bool = Field(True, description="外部推送失败立即告警")
    alert_insight_batch_fail: bool = Field(True, description="提炼批处理失败告警")
    alert_health_scan_fail: bool = Field(True, description="健康扫描失败告警")
    alert_concept_extraction_fail: bool = Field(True, description="概念抽取失败告警")
    alert_slow_call_threshold: float = Field(5.0, description="LLM 慢调用阈值（秒）")

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

    # 对话知识沉淀配置
    insight_extraction_enabled: Optional[bool] = Field(None)
    insight_extraction_schedule: Optional[str] = Field(None, max_length=5)
    insight_min_answer_length: Optional[int] = Field(None, ge=50)
    insight_dedup_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    insight_auto_approve_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

    # 概念术语关联配置
    concept_extraction_enabled: Optional[bool] = Field(None)
    concept_min_chunk_length: Optional[int] = Field(None, ge=100)
    concept_max_per_round: Optional[int] = Field(None, ge=1, le=20)
    concept_summary_max_length: Optional[int] = Field(None, ge=50, le=500)

    # 监控告警配置
    alert_llm_route_fail_threshold: Optional[int] = Field(None, ge=1)
    alert_fallback_rate_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    alert_centroid_fail: Optional[bool] = Field(None)
    alert_external_push_fail: Optional[bool] = Field(None)
    alert_insight_batch_fail: Optional[bool] = Field(None)
    alert_health_scan_fail: Optional[bool] = Field(None)
    alert_concept_extraction_fail: Optional[bool] = Field(None)
    alert_slow_call_threshold: Optional[float] = Field(None, ge=0.0)
