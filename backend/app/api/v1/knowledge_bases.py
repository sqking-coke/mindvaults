"""知识库 CRUD API 路由。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import success_response
from app.schemas.knowledge_base import (
    KbCreateRequest, KbUpdateRequest, KbInfo, KbListResponse,
    KbConfigRequest, KbConfigResponse,
)
from app.services import kb_service

router = APIRouter(prefix="/knowledge-bases", tags=["kb_knowledge_bases"])


def _mask_api_key(key: str | None) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••••••"
    return f"{key[:4]}••••••••{key[-4:]}"


@router.post("")
async def create(body: KbCreateRequest, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.create_kb(db, body)
    return success_response({
        "id": kb.id, "name": kb.name,
        "description": kb.description or "", "doc_count": 0,
        "created_at": kb.created_at, "updated_at": kb.updated_at,
    })


@router.get("")
async def list_all(db: AsyncSession = Depends(get_db)):
    items = await kb_service.list_kbs(db)
    return success_response({"items": items, "total": len(items)})


@router.put("/{kb_id}")
async def update(kb_id: int, body: KbUpdateRequest, db: AsyncSession = Depends(get_db)):
    kb = await kb_service.update_kb(db, kb_id, body)
    return success_response({
        "id": kb.id, "name": kb.name,
        "description": kb.description or "",
        "created_at": kb.created_at, "updated_at": kb.updated_at,
    })


@router.delete("/{kb_id}")
async def delete(kb_id: int, db: AsyncSession = Depends(get_db)):
    await kb_service.delete_kb(db, kb_id)
    return success_response({"deleted": kb_id})


@router.get("/{kb_id}/config")
async def get_config(kb_id: int, db: AsyncSession = Depends(get_db)):
    cfg = await kb_service.get_kb_config(db, kb_id)
    return success_response({
        "kb_id": cfg.kb_id, "chunk_size": cfg.chunk_size,
        "chunk_overlap": cfg.chunk_overlap, "top_k": cfg.top_k,
        "similarity_threshold": cfg.similarity_threshold,
        "embedding_dim": cfg.embedding_dim,
        "llm_provider": cfg.llm_provider, "llm_base_url": cfg.llm_base_url,
        "llm_model": cfg.llm_model, "llm_api_key": _mask_api_key(cfg.llm_api_key),
        "llm_temperature": cfg.llm_temperature, "system_prompt": cfg.system_prompt,
    })


@router.put("/{kb_id}/config")
async def update_config(kb_id: int, body: KbConfigRequest, db: AsyncSession = Depends(get_db)):
    cfg = await kb_service.update_kb_config(db, kb_id, body)
    return success_response({
        "kb_id": cfg.kb_id, "chunk_size": cfg.chunk_size,
        "chunk_overlap": cfg.chunk_overlap, "top_k": cfg.top_k,
        "similarity_threshold": cfg.similarity_threshold,
        "embedding_dim": cfg.embedding_dim,
        "llm_provider": cfg.llm_provider, "llm_base_url": cfg.llm_base_url,
        "llm_model": cfg.llm_model, "llm_api_key": _mask_api_key(cfg.llm_api_key),
        "llm_temperature": cfg.llm_temperature, "system_prompt": cfg.system_prompt,
    })
