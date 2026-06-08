"""概念/术语关联 — REST API。

GET    /api/v1/kb/concepts         — 分页列表（支持搜索、状态筛选）
GET    /api/v1/kb/concepts/{id}    — 概念详情 + 引用chunk列表
PUT    /api/v1/kb/concepts/{id}    — 更新概念定义/别名/状态
DELETE /api/v1/kb/concepts/{id}    — 删除概念
POST   /api/v1/kb/concepts         — 手动创建概念
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector
from loguru import logger

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


@router.post("/concepts/cleanup-orphans", response_model=dict)
async def cleanup_orphans(
    kb_id: int | None = Query(None, description="指定 KB，不传则清理所有"),
    db: AsyncSession = Depends(get_db),
):
    """一键清除所有无 chunk 引用的孤立概念。"""
    result = await concept_service.cleanup_orphan_concepts(db, kb_id)
    return success_response(result)


@router.post("/concepts", response_model=dict)
async def create_concept(payload: ConceptManualCreateRequest, db: AsyncSession = Depends(get_db)):
    """手动创建概念（不自动关联 chunk）。"""
    from app.models.concept import KbConcept

    concept = KbConcept(
        kb_id=payload.kb_id or 0,
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
        "kb_id": concept.kb_id if concept.kb_id else None,
        "name": concept.name,
        "aliases": concept.aliases,
        "definition": concept.definition,
        "summary": concept.summary,
        "status": concept.status,
        "confidence": concept.confidence,
        "created_at": concept.created_at.isoformat(),
    })


class SuggestChunksRequest(BaseModel):
    definition: str
    kb_id: int


@router.post("/concepts/suggest-chunks", response_model=dict)
async def suggest_chunks(payload: SuggestChunksRequest, db: AsyncSession = Depends(get_db)):
    """根据概念定义，搜索 KB 内 top-5 语义相近的 chunk，供用户手动选择关联。"""
    from app.models.chunk import KbChunk
    from app.models.document import KbDocument
    from app.models.system_config import SystemConfig
    from app.services.embedding_service import embed_text, resolve_embedding_config

    # 从 DB 读取 embedding 配置（用户在 UI 中设置的 key）
    sys_cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
    emb_cfg = await resolve_embedding_config(sys_cfg)

    try:
        embedding = await embed_text(
            payload.definition,
            api_key=emb_cfg.api_key,
            base_url=emb_cfg.base_url,
            provider=emb_cfg.provider,
            model=emb_cfg.model,
        )
    except Exception as exc:
        return error_response(5000, f"向量化失败: {exc}")

    vec = type_coerce(embedding, Vector(1024))
    sim_expr = (1.0 - func.cosine_distance(KbChunk.embedding, vec)).label("similarity")

    rows = (
        await db.execute(
            select(KbChunk.id, KbChunk.content, KbDocument.doc_name, sim_expr)
            .join(KbDocument, KbChunk.document_id == KbDocument.id)
            .where(
                KbDocument.kb_id == payload.kb_id,
                KbDocument.deleted_at.is_(None),
                KbChunk.status == "active",
            )
            .order_by(func.cosine_distance(KbChunk.embedding, vec))
            .limit(5)
        )
    ).all()

    chunks = [
        {
            "chunk_id": r.id,
            "content_preview": (r.content or "")[:200],
            "doc_name": r.doc_name,
            "similarity": round(float(r.similarity), 4),
        }
        for r in rows
    ]
    return success_response({"chunks": chunks})


class LinkChunksRequest(BaseModel):
    chunk_ids: list[int]


@router.post("/concepts/{concept_id}/link", response_model=dict)
async def link_concept_chunks(
    concept_id: int, payload: LinkChunksRequest, db: AsyncSession = Depends(get_db),
):
    """手动关联概念与切片。"""
    from app.models.concept import KbConcept, KbChunkConcept

    concept = await db.get(KbConcept, concept_id)
    if not concept:
        return error_response(4004, "概念不存在")

    linked = 0
    for chunk_id in payload.chunk_ids:
        existing = await db.scalar(
            select(KbChunkConcept).where(
                KbChunkConcept.concept_id == concept_id,
                KbChunkConcept.chunk_id == chunk_id,
            )
        )
        if existing:
            continue
        db.add(KbChunkConcept(
            concept_id=concept_id,
            chunk_id=chunk_id,
            relevance=1.0,
        ))
        linked += 1

    await db.commit()
    return success_response({"linked": linked})
