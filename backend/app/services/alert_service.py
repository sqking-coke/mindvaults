"""告警服务 — 告警规则检查。

检查 kb_monitor_events 表中的失败/异常事件，根据 system_config 中的告警
阈值判断是否触发告警。当前版本仅做页面内告警（通过事件查询 API 返回），
Webhook 推送后续实现。
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor_event import KbMonitorEvent
from app.models.system_config import SystemConfig
from app.utils.logger import log_event


async def _get_system_config(db: AsyncSession) -> SystemConfig:
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)
        await db.flush()
    return sys_cfg


async def check_alert_rules(db: AsyncSession) -> list[dict]:
    """检查所有告警规则，返回触发告警的规则列表。

    每条告警 dict:
        - rule: 规则名称
        - severity: critical / warning
        - message: 告警描述
        - value: 当前值
        - threshold: 阈值
    """
    sys_cfg = await _get_system_config(db)
    alerts = []

    # 1. LLM 路由连续失败告警
    if sys_cfg.alert_llm_route_fail_threshold > 0:
        recent_fails = await _count_recent_consecutive(
            db, "llm_route_failed", limit=sys_cfg.alert_llm_route_fail_threshold
        )
        if recent_fails >= sys_cfg.alert_llm_route_fail_threshold:
            alerts.append({
                "rule": "llm_route_consecutive_fail",
                "severity": "critical",
                "message": f"LLM 路由连续失败 {recent_fails} 次",
                "value": recent_fails,
                "threshold": sys_cfg.alert_llm_route_fail_threshold,
            })

    # 2. 降级率告警
    if sys_cfg.alert_fallback_rate_threshold > 0:
        fallback_rate = await _calc_fallback_rate(db)
        if fallback_rate >= sys_cfg.alert_fallback_rate_threshold:
            alerts.append({
                "rule": "high_fallback_rate",
                "severity": "warning",
                "message": f"路由降级率 {fallback_rate:.1%} 超过阈值",
                "value": round(fallback_rate, 4),
                "threshold": sys_cfg.alert_fallback_rate_threshold,
            })

    # 3-7. 即时失败告警（检查最近 1 小时是否有失败事件）
    failed_checks = [
        ("centroid_fail", sys_cfg.alert_centroid_fail, "centroid_update_failed", "质心计算失败"),
        ("external_push_fail", sys_cfg.alert_external_push_fail, "external_push_failed", "外部推送失败"),
        ("insight_batch_fail", sys_cfg.alert_insight_batch_fail, "insight_batch_failed", "提炼批处理失败"),
        ("health_scan_fail", sys_cfg.alert_health_scan_fail, "health_scan_failed", "健康扫描失败"),
        ("concept_extraction_fail", sys_cfg.alert_concept_extraction_fail, "concept_extraction_failed", "概念抽取失败"),
    ]

    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    for rule_name, enabled, event_name, description in failed_checks:
        if not enabled:
            continue
        count = await _count_recent_events(db, event_name, one_hour_ago)
        if count > 0:
            alerts.append({
                "rule": rule_name,
                "severity": "critical",
                "message": f"{description}：最近 1 小时发生 {count} 次",
                "value": count,
                "threshold": 0,
            })

    if alerts:
        log_event("alert_rules_checked", triggered=len(alerts))
    return alerts


async def _count_recent_consecutive(db: AsyncSession, event_name: str, limit: int = 3) -> int:
    """统计最近的连续失败次数（按时间倒序，直到遇到非失败事件）。"""
    recent = await db.execute(
        select(KbMonitorEvent)
        .where(KbMonitorEvent.event == event_name)
        .order_by(KbMonitorEvent.created_at.desc())
        .limit(limit)
    )
    return len(recent.scalars().all())


async def _calc_fallback_rate(db: AsyncSession) -> float:
    """计算近 1 小时降级率。"""
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    total = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.category == "routing",
            KbMonitorEvent.created_at >= one_hour_ago,
        )
    )
    fallback = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.category == "routing",
            KbMonitorEvent.event.in_(["route_fallback", "route_search_all", "route_manual"]),
            KbMonitorEvent.created_at >= one_hour_ago,
        )
    )
    total_count = total.scalar() or 0
    fallback_count = fallback.scalar() or 0
    return fallback_count / total_count if total_count > 0 else 0.0


async def _count_recent_events(db: AsyncSession, event_name: str, since: datetime) -> int:
    """统计某事件自某个时间以来的出现次数。"""
    result = await db.execute(
        select(func.count(KbMonitorEvent.id)).where(
            KbMonitorEvent.event == event_name,
            KbMonitorEvent.created_at >= since,
        )
    )
    return result.scalar() or 0
