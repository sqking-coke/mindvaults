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
from app.services.cache_service import CacheService


async def get_config(db: AsyncSession) -> KbConfig:
    """获取默认 KB (id=1) 的配置。向后兼容旧调用方。"""
    return await get_config_by_kb(db, kb_id=1)


async def get_config_by_kb(db: AsyncSession, kb_id: int) -> KbConfig:
    """获取指定 KB 的配置；不存在则创建默认行。"""
    row = (await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
    return row


async def _pgvector_search(
    db: AsyncSession,
    query_embedding: list[float],
    k: int,
    thresh: float,
    kb_id: int,
) -> list[RefChunk]:
    """pgvector HNSW 语义检索（限定 KB），返回相似切片列表（按相似度降序）。"""
    vec = type_coerce(query_embedding, Vector(1024))
    similarity_expr = 1.0 - func.cosine_distance(KbChunk.embedding, vec)

    stmt = (
        select(
            KbChunk.id.label("chunk_id"),
            KbDocument.doc_name,
            KbChunk.content,
            similarity_expr.label("similarity"),
            KbChunk.page,
        )
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.deleted_at.is_(None),
            KbDocument.status == DOC_STATUS_COMPLETED,
            KbDocument.kb_id == kb_id,
            func.cosine_distance(KbChunk.embedding, vec) <= 1.0 - thresh,
        )
        .order_by(similarity_expr.desc())
        .limit(k)
    )

    rows = (await db.execute(stmt)).all()
    logger.info(f"pgvector 检索完成: top_k={k} threshold={thresh} hits={len(rows)}")

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
    """语义检索（Redis 缓存 + pgvector 降级）。限定 KB 范围。"""
    kb = kb_id or 1
    cfg = await get_config_by_kb(db, kb)
    k = top_k if top_k is not None else cfg.top_k
    thresh = threshold if threshold is not None else cfg.similarity_threshold

    # —— 优先读缓存 ——
    cache = None
    if settings.REDIS_CACHE_ENABLED:
        try:
            redis = await get_redis()
            cache = CacheService(redis)
            cached = await cache.get_retrieval(query_embedding)
            if cached:
                logger.info(f"检索缓存命中: chunks={len(cached)}")
                return cached
        except Exception:
            logger.opt(exception=True).warning("Redis 不可用，降级至 pgvector")

    # —— 缓存未命中，走 pgvector ——
    chunks = await _pgvector_search(db, query_embedding, k, thresh, kb)

    # —— 回写缓存 ——
    if cache is not None and chunks:
        try:
            await cache.set_retrieval(query_embedding, chunks)
        except Exception:
            logger.opt(exception=True).warning("检索缓存回写失败")

    return chunks
