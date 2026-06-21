"""监控事件服务 — 事件写入 + 看板聚合查询 + 告警规则检查。

职责：
- write_event(): 各模块埋点写入 kb_monitor_events
- get_dashboard_data(): 看板全量聚合数据
- get_active_alerts(): 未解除警告/失败事件
- check_alerts(): 告警规则检查（由 API 或定时任务调用）
"""
import contextvars
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor_event import KbMonitorEvent
from app.models.system_config import SystemConfig
from app.schemas.monitor import (
    DashboardData,
    RouteMetrics,
    LLMMetrics,
    TrendPoint,
    TrendSeries,
    LatencyBucket,
    KbHotness,
    SystemEventSummary,
    InsightConceptSummary,
    MonitorEventItem,
)
from app.utils.logger import log_event

# ── 事件来源上下文（ContextVar 跨异步任务传播）──────────────

_event_source: contextvars.ContextVar[str] = contextvars.ContextVar(
    "monitor_event_source", default="web"
)


def set_event_source(source: str) -> None:
    """设置当前异步上下文的监控事件来源。调用方（MCP / scheduler）在调用 service 前设置。"""
    _event_source.set(source)


def get_event_source() -> str:
    """获取当前异步上下文的监控事件来源。"""
    return _event_source.get()


async def _get_system_config(db: AsyncSession) -> SystemConfig:
    """获取系统配置（已有就返回，没有就创建）。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)
        await db.flush()
    return sys_cfg


async def write_event(
    db: AsyncSession,
    *,
    category: str,
    event: str,
    kb_id: Optional[int] = None,
    session_id: Optional[str] = None,
    value_int: Optional[int] = None,
    value_float: Optional[float] = None,
    status: str = "success",
    message: Optional[str] = None,
    extra_json: Optional[dict] = None,
    source: Optional[str] = None,
) -> KbMonitorEvent:
    """写入一条监控事件。

    Args:
        source: 事件来源。None 时从 ContextVar 自动获取（默认 'web'）。
                显式传入 'mcp' / 'scheduler' 可覆盖。
    """
    evt = KbMonitorEvent(
        category=category,
        event=event,
        kb_id=kb_id,
        session_id=session_id,
        value_int=value_int,
        value_float=value_float,
        status=status,
        message=message,
        extra_json=extra_json or {},
        source=source or _event_source.get(),
    )
    db.add(evt)
    await db.flush()
    log_event(
        "monitor_event_written",
        category=category,
        event=event,
        status=status,
        kb_id=kb_id or 0,
    )
    return evt


# ── 看板聚合查询 ──────────────────────────────────────────

async def get_dashboard_data(db: AsyncSession) -> DashboardData:
    """获取监控看板全部聚合数据。"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start
    week_ago = today_start - timedelta(days=6)
    day_ago = now - timedelta(hours=24)

    # 活跃告警（近 7 天未解除）
    active_alerts = await _get_active_alerts(db, week_ago)

    # 路由指标
    route_metrics = await _get_route_metrics(db, today_start, yesterday_start, yesterday_end)

    # LLM 指标
    llm_metrics = await _get_llm_metrics(db, today_start, day_ago)

    # 路由趋势
    route_trend = await _get_route_trend(db, week_ago, today_start)

    # Token 趋势
    token_trend = await _get_token_trend(db, week_ago, today_start)

    # 耗时分布
    latency_dist = await _get_latency_distribution(db, today_start)

    # KB 热度
    kb_hotness = await _get_kb_hotness(db, today_start)

    # 系统事件
    system_events = await _get_system_events(db, day_ago)

    # 提炼概念摘要
    insight_concept = await _get_insight_concept_summary(db, week_ago)

    return DashboardData(
        active_alerts=[MonitorEventItem.model_validate(a) for a in active_alerts],
        route_metrics=route_metrics,
        llm_metrics=llm_metrics,
        route_trend=route_trend,
        token_trend=token_trend,
        latency_distribution=latency_dist,
        kb_hotness=kb_hotness,
        system_events=system_events,
        insight_concept=insight_concept,
    )


async def _get_active_alerts(db: AsyncSession, since: datetime) -> list[KbMonitorEvent]:
    """获取活跃告警（status=failed/warning 且今日产生、未解除）。"""
    result = await db.execute(
        select(KbMonitorEvent)
        .where(
            KbMonitorEvent.status.in_(["failed", "warning"]),
            KbMonitorEvent.resolved_at.is_(None),
            KbMonitorEvent.created_at >= since,
        )
        .order_by(KbMonitorEvent.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


async def _get_route_metrics(
    db: AsyncSession,
    today_start: datetime,
    yesterday_start: datetime,
    yesterday_end: datetime,
) -> RouteMetrics:
    """计算路由指标卡（今日 vs 昨日）。"""

    # 今日 stats
    today_stats = await _route_stats(db, today_start)
    # 昨日 stats
    yesterday_stats = await _route_stats(db, yesterday_start, yesterday_end)

    total = today_stats["total"]
    centroid_hit = today_stats["centroid_hit"]
    llm_hit = today_stats["llm_hit"]
    fallback = today_stats["fallback"]

    centroid_rate = centroid_hit / total if total > 0 else 0.0
    llm_rate = llm_hit / total if total > 0 else 0.0
    fallback_rate = fallback / total if total > 0 else 0.0

    # 变化
    y_total = yesterday_stats["total"]
    y_centroid_rate = yesterday_stats["centroid_hit"] / y_total if y_total > 0 else 0.0
    y_llm_rate = yesterday_stats["llm_hit"] / y_total if y_total > 0 else 0.0
    y_fallback_rate = yesterday_stats["fallback"] / y_total if y_total > 0 else 0.0

    def _change(today_val, yesterday_val):
        if yesterday_val is None:
            return None
        return today_val - yesterday_val

    return RouteMetrics(
        total_routes=total,
        centroid_hit_rate=round(centroid_rate, 4),
        llm_route_rate=round(llm_rate, 4),
        fallback_rate=round(fallback_rate, 4),
        total_routes_change=_change(total, y_total) if y_total > 0 else None,
        centroid_hit_rate_change=round(centroid_rate - y_centroid_rate, 4) if y_total > 0 else None,
        llm_route_rate_change=round(llm_rate - y_llm_rate, 4) if y_total > 0 else None,
        fallback_rate_change=round(fallback_rate - y_fallback_rate, 4) if y_total > 0 else None,
    )


async def _route_stats(db: AsyncSession, start: datetime, end: Optional[datetime] = None):
    """统计某时间段的路由事件。"""
    filters = [
        KbMonitorEvent.category == "routing",
        KbMonitorEvent.created_at >= start,
    ]
    if end:
        filters.append(KbMonitorEvent.created_at < end)

    total_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(and_(*filters))
    )
    total = total_result.scalar() or 0

    centroid_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            and_(*filters, KbMonitorEvent.event == "centroid_hit")
        )
    )
    llm_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            and_(*filters, KbMonitorEvent.event.in_(["llm_route_hit"]))
        )
    )
    fallback_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            and_(*filters, KbMonitorEvent.event.in_(["route_fallback", "route_search_all", "route_manual"]))
        )
    )

    return {
        "total": total,
        "centroid_hit": centroid_result.scalar() or 0,
        "llm_hit": llm_result.scalar() or 0,
        "fallback": fallback_result.scalar() or 0,
    }


async def _get_llm_metrics(
    db: AsyncSession,
    today_start: datetime,
    day_ago: datetime,
) -> LLMMetrics:
    """计算 LLM 调用指标。"""

    # 调用次数和耗时
    count_result = await db.execute(
        select(
            func.count(KbMonitorEvent.id),
            func.avg(KbMonitorEvent.value_float),
            func.max(KbMonitorEvent.value_float),
        ).where(
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= today_start,
        )
    )
    count, avg_dur, max_dur = count_result.one()

    # P99 耗时（简化：用 value_float 排序取 99 分位）
    p99_result = await db.execute(
        select(KbMonitorEvent.value_float)
        .where(
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= today_start,
        )
        .order_by(KbMonitorEvent.value_float.desc())
        .limit(max(1, int((count or 0) * 0.01)) + 1)
    )
    p99_vals = p99_result.scalars().all()
    p99 = p99_vals[-1] if p99_vals else 0.0

    # Token 数量
    token_result = await db.execute(
        select(
            func.sum(KbMonitorEvent.value_int),
        ).where(
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= today_start,
        )
    )
    total_token = token_result.scalar() or 0

    # Token 用量暂从 value_int 聚合（llm_call_completed 事件写入时填充 total_tokens）
    # 后续可以从 extra_json 拆分 input/output 明细
    input_tokens = int((total_token or 0) * 0.85)
    output_tokens = (total_token or 0) - input_tokens

    # 可用率 = 成功次数 / 总调用次数 (近 24h)
    total_calls_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= day_ago,
        )
    )
    failed_calls_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.event == "llm_call_failed",
            KbMonitorEvent.created_at >= day_ago,
        )
    )
    total_calls = total_calls_result.scalar() or 0
    failed_calls = failed_calls_result.scalar() or 0
    availability = (total_calls - failed_calls) / total_calls if total_calls > 0 else 1.0

    # 慢调用
    sys_cfg = await _get_system_config(db)
    slow_threshold = sys_cfg.alert_slow_call_threshold
    slow_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= today_start,
            KbMonitorEvent.value_float >= slow_threshold,
        )
    )

    return LLMMetrics(
        call_count=count or 0,
        avg_duration=round(avg_dur, 3) if avg_dur else 0.0,
        p99_duration=round(p99, 3),
        slow_call_count=slow_result.scalar() or 0,
        token_input=input_tokens,
        token_output=output_tokens,
        availability=round(availability, 4),
    )


async def _get_route_trend(
    db: AsyncSession, week_ago: datetime, today_start: datetime
) -> list[TrendSeries]:
    """近 7 天路由趋势。"""
    dates = []
    for i in range(7):
        d = today_start - timedelta(days=6 - i)
        dates.append(d)

    centroid_data = []
    llm_data = []
    for d in dates:
        day_end = d + timedelta(days=1)
        stats = await _route_stats(db, d, day_end)
        total = stats["total"]
        centroid_data.append(TrendPoint(
            date=d.strftime("%m/%d"),
            value=round(stats["centroid_hit"] / total, 4) if total > 0 else 0.0,
        ))
        llm_data.append(TrendPoint(
            date=d.strftime("%m/%d"),
            value=round(stats["llm_hit"] / total, 4) if total > 0 else 0.0,
        ))

    return [
        TrendSeries(label="质心命中率", color="#818cf8", data=centroid_data),
        TrendSeries(label="LLM 路由率", color="#34d399", data=llm_data),
    ]


async def _get_token_trend(
    db: AsyncSession, week_ago: datetime, today_start: datetime
) -> list[TrendSeries]:
    """近 7 天 Token 用量趋势。"""
    dates = []
    for i in range(7):
        d = today_start - timedelta(days=6 - i)
        dates.append(d)

    input_data = []
    output_data = []
    for d in dates:
        day_end = d + timedelta(days=1)
        result = await db.execute(
            select(func.sum(KbMonitorEvent.value_int)).where(
                KbMonitorEvent.event == "llm_call_completed",
                KbMonitorEvent.created_at >= d,
                KbMonitorEvent.created_at < day_end,
            )
        )
        total = result.scalar() or 0
        inp = int(total * 0.85)
        out = total - inp

        input_data.append(TrendPoint(date=d.strftime("%m/%d"), value=inp))
        output_data.append(TrendPoint(date=d.strftime("%m/%d"), value=out))

    return [
        TrendSeries(label="输入 Token", color="#fbbf24", data=input_data),
        TrendSeries(label="输出 Token", color="#f59e0b", data=output_data),
    ]


async def _get_latency_distribution(
    db: AsyncSession, today_start: datetime
) -> list[LatencyBucket]:
    """LLM 调用耗时分布（分桶统计）。"""
    buckets = [
        ("<1s", 0, 1.0, "#34d399"),
        ("1-2s", 1.0, 2.0, "#a3e635"),
        ("2-4s", 2.0, 4.0, "#fbbf24"),
        ("4-8s", 4.0, 8.0, "#f97316"),
        (">8s", 8.0, float("inf"), "#ef4444"),
    ]

    result = []
    for label, lo, hi, color in buckets:
        filters = [
            KbMonitorEvent.event == "llm_call_completed",
            KbMonitorEvent.created_at >= today_start,
            KbMonitorEvent.value_float >= lo,
        ]
        if hi != float("inf"):
            filters.append(KbMonitorEvent.value_float < hi)
        count_result = await db.execute(
            select(func.count(KbMonitorEvent.id)).where(and_(*filters))
        )
        result.append(LatencyBucket(label=label, count=count_result.scalar() or 0, color=color))

    return result


async def _get_kb_hotness(db: AsyncSession, today_start: datetime) -> list[KbHotness]:
    """KB 匹配热度（今日）。关联 kb_knowledge_bases 获取真实名称。"""
    from app.models.knowledge_base import KnowledgeBase
    rows = await db.execute(
        select(
            KbMonitorEvent.kb_id,
            KnowledgeBase.name,
            func.count(KbMonitorEvent.id).label("cnt"),
        )
        .join(KnowledgeBase, KbMonitorEvent.kb_id == KnowledgeBase.id, isouter=True)
        .where(
            KbMonitorEvent.category == "routing",
            KbMonitorEvent.event.in_(["centroid_hit", "llm_route_hit", "route_manual"]),
            KbMonitorEvent.created_at >= today_start,
        )
        .group_by(KbMonitorEvent.kb_id, KnowledgeBase.name)
        .order_by(func.count(KbMonitorEvent.id).desc())
        .limit(10)
    )
    return [
        KbHotness(kb_id=row.kb_id or 0, kb_name=row.name or f"KB-{row.kb_id}", count=row.cnt)
        for row in rows
    ]


async def _get_system_events(db: AsyncSession, day_ago: datetime) -> list[SystemEventSummary]:
    """近 24h 系统事件摘要（按模块分组成功/失败）。"""
    modules = [
        ("external", "外部推送", ["external_push_received", "external_push_deduped"]),
        ("concept", "概念抽取", ["concept_extraction_completed"]),
        ("health", "健康扫描", ["health_scan_completed"]),
        ("insight", "知识提炼", ["insight_batch_completed"]),
    ]

    result = []
    for module, module_label, success_events in modules:
        success_result = await db.execute(
            select(func.count(KbMonitorEvent.id)).where(
                KbMonitorEvent.category == module,
                KbMonitorEvent.event.in_(success_events),
                KbMonitorEvent.status == "success",
                KbMonitorEvent.created_at >= day_ago,
            )
        )
        failed_result = await db.execute(
            select(func.count(KbMonitorEvent.id)).where(
                KbMonitorEvent.category == module,
                KbMonitorEvent.status == "failed",
                KbMonitorEvent.created_at >= day_ago,
            )
        )
        result.append(SystemEventSummary(
            module=module,
            module_label=module_label,
            success_count=success_result.scalar() or 0,
            failed_count=failed_result.scalar() or 0,
        ))

    return result


async def _get_insight_concept_summary(
    db: AsyncSession, week_ago: datetime
) -> InsightConceptSummary:
    """本周提炼与概念摘要。"""
    insight_count_result = await db.execute(
        select(func.sum(KbMonitorEvent.value_int)).where(
            KbMonitorEvent.event == "insight_batch_completed",
            KbMonitorEvent.created_at >= week_ago,
        )
    )
    concept_count_result = await db.execute(
        select(func.sum(KbMonitorEvent.value_int)).where(
            KbMonitorEvent.event == "concept_extraction_completed",
            KbMonitorEvent.created_at >= week_ago,
        )
    )
    # health score avg
    health_result = await db.execute(
        select(func.avg(KbMonitorEvent.value_float)).where(
            KbMonitorEvent.event == "health_scan_completed",
            KbMonitorEvent.created_at >= week_ago,
        )
    )

    # active alerts (unresolved failed/warning this week)
    alert_count_result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.status.in_(["failed", "warning"]),
            KbMonitorEvent.resolved_at.is_(None),
            KbMonitorEvent.created_at >= week_ago,
        )
    )

    return InsightConceptSummary(
        insight_count=insight_count_result.scalar() or 0,
        concept_count=concept_count_result.scalar() or 0,
        health_score_avg=round(health_result.scalar() or 0.0, 1),
        pending_alerts=alert_count_result.scalar() or 0,
    )
