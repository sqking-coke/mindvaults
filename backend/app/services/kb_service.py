"""知识库 CRUD 服务层。"""
from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import KbNotFoundError
from app.models.knowledge_base import KnowledgeBase
from app.models.config import KbConfig
from app.models.document import KbDocument
from app.models.session import KbSession
from app.schemas.knowledge_base import (
    KbCreateRequest, KbUpdateRequest, KbConfigRequest,
)


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
        raise KbNotFoundError(detail=f"kb_id={kb_id}")
    return kb


async def list_kbs(db: AsyncSession) -> list[dict]:
    """列出所有知识库，含文档计数和字符总量（排除软删除）。"""
    from app.models.chunk import KbChunk

    # 子查询：只统计未删除文档的切片字符数
    char_subq = (
        select(func.coalesce(func.sum(func.length(KbChunk.content)), 0))
        .select_from(KbChunk)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(KbDocument.kb_id == KnowledgeBase.id)
        .correlate(KnowledgeBase)
        .scalar_subquery()
    )

    rows = (
        await db.execute(
            select(
                KnowledgeBase,
                func.count(func.distinct(KbDocument.id)).label("doc_count"),
                char_subq.label("char_count"),
            )
            .outerjoin(
                KbDocument,
                KbDocument.kb_id == KnowledgeBase.id,
            )
            .group_by(KnowledgeBase.id)
            .order_by(KnowledgeBase.id)
        )
    ).all()

    result = []
    for kb, doc_count, char_count in rows:
        logger.debug(
            f"list_kbs kb_id={kb.id} name={kb.name} "
            f"doc_count={doc_count} char_count={char_count}"
        )
        result.append({
            "id": kb.id,
            "name": kb.name,
            "description": kb.description or "",
            "doc_count": doc_count,
            "char_count": char_count,
            "created_at": kb.created_at,
            "updated_at": kb.updated_at,
        })
    return result


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
    """级联删除 KB → 文档 → 切片 + 会话 → QA 记录，同时清理磁盘文件和 Redis 缓存。"""
    from pathlib import Path
    from sqlalchemy import delete

    kb = await get_kb(db, kb_id)

    # 1. 收集待清理的磁盘文件路径
    doc_rows = (
        await db.execute(select(KbDocument.file_path).where(KbDocument.kb_id == kb_id))
    ).fetchall()

    # 2. 收集待清理的 Redis 会话缓存 key
    session_rows = (
        await db.execute(select(KbSession.session_id).where(KbSession.kb_id == kb_id))
    ).fetchall()

    # 3. 手动删 kb_config（PK 即 FK，不能依赖 CASCADE 置 NULL）
    await db.execute(delete(KbConfig).where(KbConfig.kb_id == kb_id))

    # 4. 级联删除 KB
    await db.delete(kb)
    await db.commit()

    # 5. 清理磁盘文件（commit 成功后执行，失败不影响主流程）
    for (file_path,) in doc_rows:
        try:
            p = Path(file_path)
            if p.exists():
                p.unlink()
        except Exception:
            pass

    # 6. 清理 Redis 推理缓存
    if session_rows:
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            keys = [f"mv:thinking:{s[0]}" for s in session_rows]
            await redis.delete(*keys)
        except Exception:
            pass


async def get_kb_config(db: AsyncSession, kb_id: int) -> KbConfig:
    """获取指定 KB 的配置；不存在则创建默认行。"""
    row = (
        await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))
    ).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
        await db.commit()  # 提交默认配置行，避免未提交事务残留
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

    await db.commit()
    await db.refresh(cfg)
    return cfg
