"""概念/术语关联 — REST API。

GET    /api/v1/kb/concepts         — 分页列表（支持搜索、状态筛选）
GET    /api/v1/kb/concepts/{id}    — 概念详情 + 引用chunk列表
PUT    /api/v1/kb/concepts/{id}    — 更新概念定义/别名/状态
DELETE /api/v1/kb/concepts/{id}    — 删除概念
POST   /api/v1/kb/concepts         — 手动创建概念
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import success_response, error_response
from app.schemas.concept import (
    ConceptUpdateRequest,
    ConceptManualCreateRequest,
    ConceptResponse,
    ConceptWithChunksResponse,
    ConceptListData,
)
from app.services import concept_service

router = APIRouter()


@router.get("/concepts", response_model=dict)
async def list_concepts(
    kb_id: int | None = Query(None, description="知识库 ID（不传=全部）"),
    search: str | None = Query(None, description="搜索术语名"),
    status: str | None = Query(None, description="状态筛选：auto/confirmed/edited/manual"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """分页列出概念，支持按 KB、术语名搜索、状态筛选。"""
    items, total = await concept_service.list_concepts(
        db, kb_id=kb_id, search=search, status=status, page=page, page_size=page_size,
    )
    return success_response({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@router.get("/concepts/{concept_id}", response_model=dict)
async def get_concept(concept_id: int, db: AsyncSession = Depends(get_db)):
    """获取概念详情 + 引用 chunk 列表 + 相关概念。"""
    result = await concept_service.get_concept(db, concept_id)
    if result is None:
        return error_response(4004, "概念不存在")
    return success_response(result)


@router.put("/concepts/{concept_id}", response_model=dict)
async def update_concept(concept_id: int, payload: ConceptUpdateRequest, db: AsyncSession = Depends(get_db)):
    """更新概念定义、别名或状态。"""
    c = await concept_service.update_concept(
        db, concept_id,
        definition=payload.definition,
        summary=payload.summary,
        aliases=payload.aliases,
        status=payload.status,
    )
    if c is None:
        return error_response(4004, "概念不存在")
    return success_response({
        "id": c.id,
        "kb_id": c.kb_id,
        "name": c.name,
        "aliases": c.aliases,
        "definition": c.definition,
        "summary": c.summary,
        "status": c.status,
        "confidence": c.confidence,
        "updated_at": c.updated_at.isoformat(),
    })


@router.delete("/concepts/{concept_id}", response_model=dict)
async def delete_concept(concept_id: int, db: AsyncSession = Depends(get_db)):
    """删除概念（CASCADE 自动清理关联记录）。"""
    ok = await concept_service.delete_concept(db, concept_id)
    if not ok:
        return error_response(4004, "概念不存在")
    return success_response({"deleted": concept_id})


@router.post("/concepts", response_model=dict)
async def create_concept(payload: ConceptManualCreateRequest, db: AsyncSession = Depends(get_db)):
    """手动创建概念。"""
    from app.models.concept import KbConcept

    concept = KbConcept(
        kb_id=payload.kb_id,
        name=payload.name,
        aliases=payload.aliases,
        definition=payload.definition,
        summary=payload.summary,
        status=payload.status,
        confidence=1.0,
    )
    db.add(concept)
    await db.commit()
    await db.refresh(concept)

    return success_response({
        "id": concept.id,
        "kb_id": concept.kb_id,
        "name": concept.name,
        "aliases": concept.aliases,
        "definition": concept.definition,
        "summary": concept.summary,
        "status": concept.status,
        "confidence": concept.confidence,
        "created_at": concept.created_at.isoformat(),
    })
