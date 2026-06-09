"""监控告警相关 Pydantic Schemas。"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── 监控事件 ───────────────────────────────────────────────

class MonitorEventItem(BaseModel):
    """监控事件列表项。"""
    id: int
    category: str
    event: str
    kb_id: Optional[int] = None
    session_id: Optional[str] = None
    value_int: Optional[int] = None
    value_float: Optional[float] = None
    status: str
    message: Optional[str] = None
    extra_json: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class MonitorEventListResponse(BaseModel):
    """监控事件分页列表。"""
    items: list[MonitorEventItem]
    total: int
    page: int
    page_size: int


# ── 看板聚合数据 ──────────────────────────────────────────

class RouteMetrics(BaseModel):
    """路由指标卡数据。"""
    total_routes: int = Field(0, description="今日路由总次数")
    centroid_hit_rate: float = Field(0.0, description="质心命中率 (0-1)")
    llm_route_rate: float = Field(0.0, description="LLM 路由率 (0-1)")
    fallback_rate: float = Field(0.0, description="降级率 (0-1)")
    # 较昨日变化
    total_routes_change: Optional[float] = None
    centroid_hit_rate_change: Optional[float] = None
    llm_route_rate_change: Optional[float] = None
    fallback_rate_change: Optional[float] = None


class LLMMetrics(BaseModel):
    """LLM 调用指标卡数据。"""
    call_count: int = Field(0, description="今日 LLM 调用次数")
    avg_duration: float = Field(0.0, description="平均调用耗时（秒）")
    p99_duration: float = Field(0.0, description="P99 耗时（秒）")
    slow_call_count: int = Field(0, description="慢调用次数")
    token_input: int = Field(0, description="今日输入 Token 数")
    token_output: int = Field(0, description="今日输出 Token 数")
    availability: float = Field(0.0, description="LLM 可用率 (0-1)")


class TrendPoint(BaseModel):
    """趋势数据点。"""
    date: str
    value: float


class TrendSeries(BaseModel):
    """趋势数据序列。"""
    label: str
    color: str
    data: list[TrendPoint]


class LatencyBucket(BaseModel):
    """耗时分布桶。"""
    label: str  # "<1s", "1-2s" 等
    count: int
    color: str  # tailwind color for bar


class KbHotness(BaseModel):
    """KB 匹配热度项。"""
    kb_id: int
    kb_name: str
    count: int


class SystemEventSummary(BaseModel):
    """系统事件摘要（单模块）。"""
    module: str
    module_label: str
    success_count: int
    failed_count: int


class InsightConceptSummary(BaseModel):
    """提炼与概念摘要。"""
    insight_count: int = 0
    concept_count: int = 0
    health_score_avg: float = 0.0
    pending_alerts: int = 0


class DashboardData(BaseModel):
    """监控看板全部数据。"""
    # 活跃告警
    active_alerts: list[MonitorEventItem] = Field(default_factory=list)
    # 路由指标卡
    route_metrics: RouteMetrics = Field(default_factory=RouteMetrics)
    # LLM 调用指标卡
    llm_metrics: LLMMetrics = Field(default_factory=LLMMetrics)
    # 路由趋势（近 7 天）
    route_trend: list[TrendSeries] = Field(default_factory=list)
    # Token 用量趋势（近 7 天）
    token_trend: list[TrendSeries] = Field(default_factory=list)
    # LLM 耗时分布
    latency_distribution: list[LatencyBucket] = Field(default_factory=list)
    # KB 匹配热度
    kb_hotness: list[KbHotness] = Field(default_factory=list)
    # 系统事件摘要
    system_events: list[SystemEventSummary] = Field(default_factory=list)
    # 提炼概念摘要
    insight_concept: InsightConceptSummary = Field(default_factory=InsightConceptSummary)


# ── 告警规则配置 ──────────────────────────────────────────

class AlertConfig(BaseModel):
    """告警规则配置（读写）。"""
    alert_llm_route_fail_threshold: int = 3
    alert_fallback_rate_threshold: float = 0.20
    alert_centroid_fail: bool = True
    alert_external_push_fail: bool = True
    alert_insight_batch_fail: bool = True
    alert_health_scan_fail: bool = True
    alert_concept_extraction_fail: bool = True
    alert_slow_call_threshold: float = 5.0
