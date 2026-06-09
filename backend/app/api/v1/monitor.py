"""监控告警 API — 事件查询 / 看板数据 / 告警列表 / 告警配置。

路由前缀: /api/v1/kb/monitor
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import success_response, ApiResponse
from app.schemas.monitor import (
    DashboardData,
    MonitorEventListResponse,
    MonitorEventItem,
    AlertConfig,
)
from app.services.monitor_service import get_dashboard_data, write_event
from app.services.alert_service import check_alert_rules
from app.models.monitor_event import KbMonitorEvent
from app.models.system_config import SystemConfig
from sqlalchemy import select, func

router = APIRouter(prefix="/monitor", tags=["监控告警"])


@router.get("/dashboard", response_model=ApiResponse[DashboardData])
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    """获取监控看板全部数据（聚合指标 + 趋势 + 事件摘要）。"""
    data = await get_dashboard_data(db)
    return success_response(data.model_dump())


@router.get("/events", response_model=ApiResponse[MonitorEventListResponse])
async def list_events(
    category: str = Query(None, description="事件分类: routing/insight/external/concept/health/system"),
    status: str = Query(None, description="事件状态: success/failed/warning"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """分页查询监控事件。"""
    filters = []
    if category:
        filters.append(KbMonitorEvent.category == category)
    if status:
        filters.append(KbMonitorEvent.status == status)

    q = select(KbMonitorEvent)
    if filters:
        from sqlalchemy import and_
        q = q.where(and_(*filters))
    q = q.order_by(KbMonitorEvent.created_at.desc())

    # total
    count_q = select(func.count(KbMonitorEvent.id))
    if filters:
        from sqlalchemy import and_
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar() or 0

    # page
    offset = (page - 1) * page_size
    rows = (await db.execute(q.offset(offset).limit(page_size))).scalars().all()

    return success_response(MonitorEventListResponse(
        items=[MonitorEventItem.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    ).model_dump())


@router.get("/alerts", response_model=ApiResponse[dict])
async def get_alerts(db: AsyncSession = Depends(get_db)):
    """获取当前告警列表（规则检查结果）。"""
    alerts = await check_alert_rules(db)
    return success_response({"alerts": alerts, "count": len(alerts)})


@router.get("/alert-config", response_model=ApiResponse[AlertConfig])
async def get_alert_config(db: AsyncSession = Depends(get_db)):
    """获取告警规则配置。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)
        await db.flush()

    return success_response(AlertConfig(
        alert_llm_route_fail_threshold=sys_cfg.alert_llm_route_fail_threshold,
        alert_fallback_rate_threshold=sys_cfg.alert_fallback_rate_threshold,
        alert_centroid_fail=sys_cfg.alert_centroid_fail,
        alert_external_push_fail=sys_cfg.alert_external_push_fail,
        alert_insight_batch_fail=sys_cfg.alert_insight_batch_fail,
        alert_health_scan_fail=sys_cfg.alert_health_scan_fail,
        alert_concept_extraction_fail=sys_cfg.alert_concept_extraction_fail,
        alert_slow_call_threshold=sys_cfg.alert_slow_call_threshold,
    ).model_dump())


@router.put("/alert-config", response_model=ApiResponse[AlertConfig])
async def update_alert_config(config: AlertConfig, db: AsyncSession = Depends(get_db)):
    """更新告警规则配置。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)

    sys_cfg.alert_llm_route_fail_threshold = config.alert_llm_route_fail_threshold
    sys_cfg.alert_fallback_rate_threshold = config.alert_fallback_rate_threshold
    sys_cfg.alert_centroid_fail = config.alert_centroid_fail
    sys_cfg.alert_external_push_fail = config.alert_external_push_fail
    sys_cfg.alert_insight_batch_fail = config.alert_insight_batch_fail
    sys_cfg.alert_health_scan_fail = config.alert_health_scan_fail
    sys_cfg.alert_concept_extraction_fail = config.alert_concept_extraction_fail
    sys_cfg.alert_slow_call_threshold = config.alert_slow_call_threshold

    await db.flush()
    return success_response(config.model_dump())


@router.post("/alerts/{event_id}/resolve", response_model=ApiResponse[dict])
async def resolve_alert(event_id: int, db: AsyncSession = Depends(get_db)):
    """解除单条告警（设置 resolved_at）。"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(KbMonitorEvent)
        .where(KbMonitorEvent.id == event_id, KbMonitorEvent.resolved_at.is_(None))
        .values(resolved_at=now)
    )
    await db.commit()
    if result.rowcount == 0:
        return success_response({"resolved": False, "message": "告警不存在或已解除"})
    return success_response({"resolved": True, "event_id": event_id})


@router.post("/alerts/resolve-all", response_model=ApiResponse[dict])
async def resolve_all_alerts(db: AsyncSession = Depends(get_db)):
    """解除所有当前活跃告警。"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(KbMonitorEvent)
        .where(
            KbMonitorEvent.status.in_(["failed", "warning"]),
            KbMonitorEvent.resolved_at.is_(None),
        )
        .values(resolved_at=now)
    )
    await db.commit()
    return success_response({"resolved": True, "count": result.rowcount})
