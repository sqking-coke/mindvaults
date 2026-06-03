from loguru import logger
from sqlalchemy import select, func, type_coerce, literal, desc, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from app.config import settings
from app.core.redis import get_redis
from app.core.exceptions import AppException
from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_COMPLETED
from app.models.config import KbConfig
from app.models.knowledge_base import KnowledgeBase
from app.schemas.chat import RefChunk
from app.utils.logger import log_event
from app.services.cache_service import CacheService


async def get_config(db: AsyncSession) -> KbConfig:
    """获取默认 KB (id=1) 的配置。向后兼容旧调用方。"""
    return await get_config_by_kb(db, kb_id=1)


async def get_config_by_kb(db: AsyncSession, kb_id: int) -> KbConfig:
    """获取指定 KB 的配置；配置不存在则自动创建默认行。

    注意：KB 本身必须已存在（由 kb_service.create_kb 创建），
    此函数不会自动创建 KB，只负责配置的懒初始化。
    """
    # 验证 KB 存在
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise AppException(code=6001, message=f"知识库不存在: {kb_id}", status_code=404)

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
    """pgvector HNSW 联合检索 — chunks + approved insights。

    kb_id=0 时检索全部知识库，否则限定指定 KB。
    沉积库（kb_type='deposition'）不参与检索。
    """
    from app.models.insight import KbInsight

    vec = type_coerce(query_embedding, Vector(1024))
    similarity_expr_chunk = 1.0 - func.cosine_distance(KbChunk.embedding, vec)
    similarity_expr_insight = 1.0 - func.cosine_distance(KbInsight.embedding, vec)

    # chunk 查询
    chunk_filters = [
        KbDocument.status == DOC_STATUS_COMPLETED,
        func.cosine_distance(KbChunk.embedding, vec) <= 1.0 - thresh,
    ]
    if kb_id > 0:
        chunk_filters.append(KbDocument.kb_id == kb_id)

    chunk_stmt = (
        select(
            KbChunk.id.label("chunk_id"),
            KbDocument.doc_name,
            KbChunk.content,
            similarity_expr_chunk.label("similarity"),
            KbChunk.page,
            func.coalesce(KbChunk.hit_count, 0).label("hit_count"),
            sa.literal("chunk").label("result_type"),
        )
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(*chunk_filters)
    )

    # insight 查询（仅 approved）
    insight_filters = [
        KbInsight.status == "approved",
        KbInsight.embedding.isnot(None),
        func.cosine_distance(KbInsight.embedding, vec) <= 1.0 - thresh,
    ]
    if kb_id > 0:
        insight_filters.append(KbInsight.kb_id == kb_id)

    insight_stmt = (
        select(
            KbInsight.id.label("chunk_id"),
            KbInsight.title.label("doc_name"),
            KbInsight.content,
            similarity_expr_insight.label("similarity"),
            sa.literal(None).label("page"),
            sa.literal(0).label("hit_count"),
            sa.literal("insight").label("result_type"),
        )
        .where(*insight_filters)
    )

    union_stmt = (
        chunk_stmt.union_all(insight_stmt)
        .order_by(sa.desc("similarity"))
        .limit(k)
    )

    rows = (await db.execute(union_stmt)).all()
    log_event("retrieval_completed", kb_id=kb_id, top_k=k, threshold=round(thresh, 2), hits=len(rows))

    return [
        RefChunk(
            chunk_id=row.chunk_id,
            doc_name=row.doc_name,
            content=row.content,
            similarity=round(row.similarity, 4),
            page=row.page,
            result_type=row.result_type,
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


# ═══════════════════════════════════════════════════════════
# 质心计算（KB 智能路由 Layer 1）
# ═══════════════════════════════════════════════════════════

_MAX_CENTROID_SAMPLE = 1000


async def compute_centroid(db: AsyncSession, kb_id: int) -> list[float] | None:
    """为指定 KB 计算质心向量（采样模式）。

    从该 KB 所属的活跃文档中随机采样最多 1000 个 chunk 的 embedding，
    计算均值向量作为该 KB 的"语义中心"。

    返回 1024 维向量或 None（chunk_count=0 时）。
    """
    from sqlalchemy import text

    # 子查询获取该 KB 的 chunk 总数
    count_stmt = (
        select(func.count(KbChunk.id))
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
            KbDocument.status == DOC_STATUS_COMPLETED,
        )
    )
    total = (await db.execute(count_stmt)).scalar_one()

    if total == 0:
        return None

    # 采样策略：≤ 1000 全量，> 1000 随机采样
    if total <= _MAX_CENTROID_SAMPLE:
        rows = (await db.execute(
            select(KbChunk.embedding)
            .join(KbDocument, KbChunk.document_id == KbDocument.id)
            .where(
                KbDocument.kb_id == kb_id,
                KbDocument.deleted_at.is_(None),
                KbDocument.status == DOC_STATUS_COMPLETED,
            )
        )).all()
    else:
        # 随机采样（TABLESAMPLE 不可靠，用 ORDER BY RANDOM）
        rows = (await db.execute(
            select(KbChunk.embedding)
            .join(KbDocument, KbChunk.document_id == KbDocument.id)
            .where(
                KbDocument.kb_id == kb_id,
                KbDocument.deleted_at.is_(None),
                KbDocument.status == DOC_STATUS_COMPLETED,
            )
            .order_by(func.random())
            .limit(_MAX_CENTROID_SAMPLE)
        )).all()

    if not rows:
        return None

    # 计算均值向量
    dim = len(rows[0][0])
    centroid = [0.0] * dim
    for (emb,) in rows:
        for i in range(dim):
            centroid[i] += emb[i]
    n = len(rows)
    for i in range(dim):
        centroid[i] /= n

    return centroid


async def update_centroid(db: AsyncSession, kb_id: int) -> None:
    """更新 KB 的质心向量字段。

    chunk_count=0 → 质心设置为 NULL（Layer 1 自动跳过该 KB）。
    计算异常 → 保持旧值，仅记录 ERROR 日志，不影响主流程。
    """
    from app.models.knowledge_base import KnowledgeBase

    try:
        centroid = await compute_centroid(db, kb_id)
        kb = await db.get(KnowledgeBase, kb_id)
        if kb is None:
            logger.warning(f"update_centroid_kb_not_found kb_id={kb_id}")
            return

        from sqlalchemy import func as sqla_func
        kb.centroid_embedding = centroid
        kb.centroid_updated_at = sqla_func.now()
        await db.commit()

        chunk_count = "null" if centroid is None else "updated"
        logger.info(f"centroid_updated kb_id={kb_id} status={chunk_count}")
    except Exception:
        logger.error(f"centroid_update_failed kb_id={kb_id}")
        await db.rollback()
