"""对话知识沉淀 API — insight 审核管理 + 手动提炼。"""

from fastapi import APIRouter, Depends, Query
from loguru import logger
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.insight import KbInsight
from app.schemas.common import success_response
from app.schemas.insight import (
    InsightReviewRequest,
    InsightListResponse,
    InsightExtractionStats,
)
from app.services.insight_service import (
    list_insights,
    get_insight,
    review_insight,
    extract_insights,
)

router = APIRouter(tags=["insights"])


@router.get("/insights")
async def list_insights_api(
    kb_id: int | None = Query(None, description="知识库 ID"),
    status: str | None = Query(None, description="审核状态: pending/approved/rejected"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
):
    """分页查询 insight 列表（审核管理）。"""
    items, total = await list_insights(db, kb_id=kb_id, status=status, page=page, page_size=page_size)
    from app.schemas.insight import InsightResponse
    return success_response(
        InsightListResponse(
            items=[InsightResponse.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        ).model_dump()
    )


@router.get("/insights/{insight_id}")
async def get_insight_api(insight_id: int, db: AsyncSession = Depends(get_db)):
    """获取单条 insight 详情。"""
    insight = await get_insight(db, insight_id)
    if insight is None:
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(message="知识点不存在", detail=f"insight_id={insight_id}")
    from app.schemas.insight import InsightResponse
    return success_response(InsightResponse.model_validate(insight).model_dump())


@router.post("/insights/{insight_id}/review")
async def review_insight_api(
    insight_id: int,
    req: InsightReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """审核通过/拒绝 insight。审核通过时可指定目标 KB。"""
    insight = await review_insight(db, insight_id, req.status, target_kb_id=req.target_kb_id)
    await db.commit()
    from app.schemas.insight import InsightResponse
    return success_response(InsightResponse.model_validate(insight).model_dump())


@router.delete("/insights/{insight_id}")
async def delete_insight_api(insight_id: int, db: AsyncSession = Depends(get_db)):
    """永久删除 insight。"""
    result = await db.execute(sa_delete(KbInsight).where(KbInsight.id == insight_id))
    if result.rowcount == 0:
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(message="知识点不存在", detail=f"insight_id={insight_id}")
    await db.commit()
    logger.info(f"insight_deleted id={insight_id}")
    return success_response({"deleted": insight_id})


@router.post("/insights/extract")
async def trigger_extraction(db: AsyncSession = Depends(get_db)):
    """手动触发 insight 批处理提炼（调试用）。"""
    from app.models.system_config import SystemConfig

    sys_cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)
        await db.flush()

    if not sys_cfg.insight_extraction_enabled:
        from app.core.exceptions import BadRequestError
        raise BadRequestError(message="知识提炼功能未启用")

    stats = await extract_insights(db, sys_cfg)
    await db.commit()

    logger.info(f"insight_extraction_manual_triggered stats={stats}")
    return success_response(InsightExtractionStats(**stats).model_dump())
