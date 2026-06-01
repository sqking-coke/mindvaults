from loguru import logger
from sqlalchemy import select, func, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector

from app.config import settings
from app.core.redis import get_redis
from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_COMPLETED
from app.models.config import KbConfig
from app.schemas.chat import RefChunk
from app.utils.logger import log_event
from app.services.cache_service import CacheService


async def get_config(db: AsyncSession) -> KbConfig:
    """获取默认 KB (id=1) 的配置。向后兼容旧调用方。"""
    return await get_config_by_kb(db, kb_id=1)


async def get_config_by_kb(db: AsyncSession, kb_id: int) -> KbConfig:
    """获取指定 KB 的配置；KB 和配置都不存在则自动创建。"""
    from app.models.knowledge_base import KnowledgeBase

    # 确保 KB 存在
    kb = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))).scalar_one_or_none()
    if kb is None:
        kb = KnowledgeBase(id=kb_id, name=f"知识库 {kb_id}", description="自动创建")
        db.add(kb)
        await db.flush()

    row = (await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
        await db.commit()
    return row


async def _pgvector_search(
    db: AsyncSession,
    query_embedding: list[float],
    k: int,
    thresh: float,
    kb_id: int,
) -> list[RefChunk]:
    """pgvector HNSW 语义检索，返回相似切片列表（按相似度降序）。

    kb_id=0 时检索全部知识库，否则限定指定 KB。
    """
    vec = type_coerce(query_embedding, Vector(1024))
    similarity_expr = 1.0 - func.cosine_distance(KbChunk.embedding, vec)

    filters = [
        KbDocument.status == DOC_STATUS_COMPLETED,
        func.cosine_distance(KbChunk.embedding, vec) <= 1.0 - thresh,
    ]
    if kb_id > 0:
        filters.append(KbDocument.kb_id == kb_id)

    stmt = (
        select(
            KbChunk.id.label("chunk_id"),
            KbDocument.doc_name,
            KbChunk.content,
            similarity_expr.label("similarity"),
            KbChunk.page,
        )
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(*filters)
        .order_by(similarity_expr.desc())
        .limit(k)
    )

    rows = (await db.execute(stmt)).all()
    log_event("retrieval_completed", kb_id=kb_id, top_k=k, threshold=round(thresh, 2), hits=len(rows))

    return [
        RefChunk(
            chunk_id=row.chunk_id,
            doc_name=row.doc_name,
            content=row.content,
            similarity=round(row.similarity, 4),
            page=row.page,
        )
        for row in rows
    ]


async def retrieve_chunks(
    db: AsyncSession,
    query_embedding: list[float],
    kb_id: int | None = None,
    top_k: int | None = None,
    threshold: float | None = None,
) -> list[RefChunk]:
    """语义检索（Redis 缓存 + pgvector 降级）。kb_id=0 检索全库。"""
    kb = kb_id if kb_id is not None and kb_id > 0 else 0
    cfg = await get_config_by_kb(db, max(kb, 1))  # kb=0 时用默认 KB 的配置
    k = top_k if top_k is not None else cfg.top_k
    thresh = threshold if threshold is not None else cfg.similarity_threshold

    # —— 优先读缓存 ——
    cache = None
    if settings.REDIS_CACHE_ENABLED:
        try:
            redis = await get_redis()
            cache = CacheService(redis)
            cached = await cache.get_retrieval(query_embedding, kb_id=kb)
            if cached:
                log_event("retrieval_cache_hit", kb_id=kb, chunks=len(cached))
                return cached
        except Exception:
            logger.warning("redis_unavailable fallback=pgvector")

    # —— 缓存未命中，走 pgvector ——
    chunks = await _pgvector_search(db, query_embedding, k, thresh, kb)

    # —— 回写缓存 ——
    if cache is not None and chunks:
        try:
            await cache.set_retrieval(query_embedding, chunks, kb_id=kb)
        except Exception:
            logger.warning("retrieval_cache_write_failed")

    return chunks
