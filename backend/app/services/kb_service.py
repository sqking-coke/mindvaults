"""知识库 CRUD 服务层。"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.knowledge_base import KnowledgeBase
from app.models.config import KbConfig
from app.models.document import KbDocument
from app.schemas.knowledge_base import (
    KbCreateRequest, KbUpdateRequest, KbConfigRequest,
)


class KbNotFoundError(AppException):
    def __init__(self, kb_id: int):
        super().__init__(code=6001, message=f"知识库不存在: {kb_id}", status_code=404)


async def create_kb(db: AsyncSession, req: KbCreateRequest) -> KnowledgeBase:
    """创建知识库，同时初始化一行默认 kb_config。"""
    kb = KnowledgeBase(name=req.name, description=req.description or "")
    db.add(kb)
    await db.flush()
    config = KbConfig(kb_id=kb.id)
    db.add(config)
    await db.commit()
    await db.refresh(kb)
    return kb


async def get_kb(db: AsyncSession, kb_id: int) -> KnowledgeBase:
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise KbNotFoundError(kb_id)
    return kb


async def list_kbs(db: AsyncSession) -> list[dict]:
    """列出所有知识库，含文档计数（排除软删除）。"""
    rows = (
        await db.execute(
            select(
                KnowledgeBase,
                func.count(KbDocument.id).label("doc_count"),
            )
            .outerjoin(
                KbDocument,
                (KbDocument.kb_id == KnowledgeBase.id) & (KbDocument.deleted_at.is_(None)),
            )
            .group_by(KnowledgeBase.id)
            .order_by(KnowledgeBase.id)
        )
    ).all()

    return [
        {
            "id": kb.id,
            "name": kb.name,
            "description": kb.description or "",
            "doc_count": doc_count,
            "created_at": kb.created_at,
            "updated_at": kb.updated_at,
        }
        for kb, doc_count in rows
    ]


async def update_kb(db: AsyncSession, kb_id: int, req: KbUpdateRequest) -> KnowledgeBase:
    kb = await get_kb(db, kb_id)
    if req.name is not None:
        kb.name = req.name
    if req.description is not None:
        kb.description = req.description
    await db.commit()
    await db.refresh(kb)
    return kb


async def delete_kb(db: AsyncSession, kb_id: int) -> None:
    """级联删除 KB → 文档 → 切片 + 会话 → QA 记录（数据库 ON DELETE CASCADE）。"""
    from sqlalchemy import delete
    kb = await get_kb(db, kb_id)
    # 先手动删 kb_config（PK 即 FK，不能依赖 CASCADE 置 NULL）
    await db.execute(delete(KbConfig).where(KbConfig.kb_id == kb_id))
    await db.delete(kb)
    await db.commit()


async def get_kb_config(db: AsyncSession, kb_id: int) -> KbConfig:
    """获取指定 KB 的配置；不存在则创建默认行。"""
    row = (
        await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))
    ).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
    return row


async def update_kb_config(db: AsyncSession, kb_id: int, req: KbConfigRequest) -> KbConfig:
    cfg = await get_kb_config(db, kb_id)

    if req.chunk_size is not None:
        cfg.chunk_size = req.chunk_size
    if req.chunk_overlap is not None:
        cfg.chunk_overlap = req.chunk_overlap
    if req.top_k is not None:
        cfg.top_k = req.top_k
    if req.similarity_threshold is not None:
        cfg.similarity_threshold = req.similarity_threshold

    if req.llm_provider is not None:
        cfg.llm_provider = req.llm_provider.strip().lower()
    if req.llm_base_url is not None:
        cfg.llm_base_url = req.llm_base_url.strip()
    if req.llm_model is not None:
        cfg.llm_model = req.llm_model.strip()
    if req.llm_api_key is not None:
        key = req.llm_api_key.strip()
        if key and "••" not in key:
            cfg.llm_api_key = key
        elif not key:
            cfg.llm_api_key = ""
    if req.llm_temperature is not None:
        cfg.llm_temperature = req.llm_temperature
    if req.system_prompt is not None:
        cfg.system_prompt = req.system_prompt.strip()

    await db.commit()
    await db.refresh(cfg)
    return cfg
