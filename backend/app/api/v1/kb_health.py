"""知识库健康诊断 API。

端点前缀 /api/v1/kb/health

GET    /reports                   — 诊断报告列表
GET    /reports/latest            — 最近报告
GET    /reports/{report_id}       — 报告详情
POST   /reports/{report_id}/resolve — 标记已处理
POST   /scan                      — 触发扫描
POST   /merge                     — 合并重复 chunk
POST   /link                      — 创建 chunk 关联
DELETE /link/{link_id}            — 删除关联
POST   /cleanup-orphans           — 清理孤岛
"""
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import KbNotFoundError
from app.schemas.common import success_response
from app.schemas.health import (
    HealthReportItem,
    HealthReportResponse,
    HealthReportDetail,
    MergeRequest,
    LinkRequest,
)
from app.services import health_service

router = APIRouter()


# ── 扫描 ───────────────────────────────────────────────

@router.post("/health/scan", response_model=dict)
async def trigger_scan(
    kb_id: int = Body(..., ge=1, embed=True, description="知识库 ID"),
    scan_type: str = Body("manual", description="scheduled / manual / ingestion"),
    db: AsyncSession = Depends(get_db),
):
    """触发全维度健康扫描，生成诊断报告。"""
    report = await health_service.scan_health(db, kb_id=kb_id, scan_type=scan_type)
    await db.commit()

    detail = HealthReportDetail(**report.details_json)
    return success_response(HealthReportResponse(
        id=report.id,
        kb_id=report.kb_id,
        scan_type=report.scan_type,
        scanned_at=report.scanned_at,
        total_chunks=report.total_chunks,
        duplicate_groups=report.duplicate_groups,
        low_quality=report.low_quality,
        outdated=report.outdated,
        orphans=report.orphans,
        fragment_clusters=report.fragment_clusters,
        health_score=report.health_score,
        details=detail,
        resolved_at=report.resolved_at,
        created_at=report.created_at,
    ).model_dump())


# ── 报告查询 ───────────────────────────────────────────

@router.get("/health/reports", response_model=dict)
async def list_reports(
    kb_id: int = Query(..., ge=1, description="知识库 ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """分页获取诊断报告列表。"""
    result = await health_service.list_reports(db, kb_id=kb_id, page=page, page_size=page_size)
    items = [HealthReportItem.model_validate(r) for r in result["items"]]
    return success_response({
        "items": [it.model_dump() for it in items],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
    })


@router.get("/health/reports/latest", response_model=dict)
async def get_latest_report(
    kb_id: int = Query(..., ge=1, description="知识库 ID"),
    db: AsyncSession = Depends(get_db),
):
    """获取最近一次诊断报告。"""
    report = await health_service.get_latest_report(db, kb_id=kb_id)
    if report is None:
        return success_response(None)
    detail = HealthReportDetail(**report.details_json)
    return success_response(HealthReportResponse(
        id=report.id,
        kb_id=report.kb_id,
        scan_type=report.scan_type,
        scanned_at=report.scanned_at,
        total_chunks=report.total_chunks,
        duplicate_groups=report.duplicate_groups,
        low_quality=report.low_quality,
        outdated=report.outdated,
        orphans=report.orphans,
        fragment_clusters=report.fragment_clusters,
        health_score=report.health_score,
        details=detail,
        resolved_at=report.resolved_at,
        created_at=report.created_at,
    ).model_dump())


@router.get("/health/reports/{report_id}", response_model=dict)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取单份诊断报告详情。"""
    report = await health_service.get_report(db, report_id)
    if report is None:
        return success_response(None)
    detail = HealthReportDetail(**report.details_json)
    return success_response(HealthReportResponse(
        id=report.id,
        kb_id=report.kb_id,
        scan_type=report.scan_type,
        scanned_at=report.scanned_at,
        total_chunks=report.total_chunks,
        duplicate_groups=report.duplicate_groups,
        low_quality=report.low_quality,
        outdated=report.outdated,
        orphans=report.orphans,
        fragment_clusters=report.fragment_clusters,
        health_score=report.health_score,
        details=detail,
        resolved_at=report.resolved_at,
        created_at=report.created_at,
    ).model_dump())


@router.post("/health/reports/{report_id}/resolve", response_model=dict)
async def resolve_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
):
    """标记诊断报告为已处理。"""
    result = await health_service.resolve_report(db, report_id)
    await db.commit()
    return success_response(result)


# ── 处理操作 ───────────────────────────────────────────

@router.post("/health/merge", response_model=dict)
async def merge_chunks(
    kb_id: int = Body(..., ge=1, embed=True),
    keep_chunk_id: int = Body(..., ge=1),
    supersede_chunk_ids: list[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """合并重复 chunk：保留一个，其余标记 superseded。"""
    result = await health_service.merge_chunks(
        db, kb_id=kb_id, keep_chunk_id=keep_chunk_id,
        supersede_chunk_ids=supersede_chunk_ids,
    )
    await db.commit()
    return success_response(result)


@router.post("/health/link", response_model=dict)
async def create_link(
    kb_id: int = Body(..., ge=1, embed=True),
    source_chunk_id: int = Body(..., ge=1),
    target_chunk_id: int = Body(..., ge=1),
    link_type: str = Body("related"),
    db: AsyncSession = Depends(get_db),
):
    """创建 chunk 间关联（related / cluster）。"""
    result = await health_service.link_chunks(
        db, kb_id=kb_id, source_chunk_id=source_chunk_id,
        target_chunk_id=target_chunk_id, link_type=link_type,
    )
    await db.commit()
    return success_response(result)


@router.delete("/health/link/{link_id}", response_model=dict)
async def delete_link(
    link_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除 chunk 间关联。"""
    result = await health_service.unlink_chunks(db, link_id)
    await db.commit()
    return success_response(result)


@router.delete("/health/reports/{report_id}", response_model=dict)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除诊断报告。"""
    result = await health_service.delete_report(db, report_id)
    await db.commit()
    return success_response(result)


@router.post("/health/archive", response_model=dict)
async def archive_chunks(
    kb_id: int = Body(..., ge=1, embed=True),
    chunk_ids: list[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """将低质量 chunk 归档（status → archived）。"""
    result = await health_service.archive_low_quality_chunks(db, kb_id, chunk_ids)
    await db.commit()
    return success_response(result)


@router.post("/health/cleanup-orphans", response_model=dict)
async def cleanup_orphans(
    kb_id: int = Body(..., ge=1, embed=True),
    db: AsyncSession = Depends(get_db),
):
    """将孤岛 chunk 批量标记为 orphan 状态。"""
    result = await health_service.cleanup_orphans(db, kb_id=kb_id)
    await db.commit()
    return success_response(result)
