"""概念/术语关联 — 核心服务。

- extract_concepts(): LLM 从 chunk 中提取术语，去重后写入 kb_concepts
- get_concepts_for_chunks(): 查询 chunk 关联的概念摘要（RAG 上下文注入用）
- CRUD: list / get / update / delete
"""

import json
import re
from collections import defaultdict

from loguru import logger
from sqlalchemy import select, func, text, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.concept import KbConcept, KbChunkConcept
from app.models.chunk import KbChunk
from app.models.system_config import SystemConfig
from app.models.document import KbDocument
from app.services.llm_service import generate
from app.services.embedding_service import embed_text, resolve_embedding_config


# ── LLM 抽取 System Prompt ────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """你是一个术语抽取助手。从以下文档片段中提取专业术语，为每个术语生成简洁定义。

要求：
- 只提取领域特定的专业术语，不提取通用词汇（如"文档""系统""用户"）
- 定义长度 ≤ 500 字，自包含，不需要上下文就能理解
- 同时生成一条 ≤ 100 字的摘要（用于注入 LLM 上下文）
- 如果片段没有值得提取的术语，返回空数组 []
- 术语要有别名（英文缩写、常见别称）
- 返回 JSON 数组，格式：
[{
  "name": "术语中文名",
  "aliases": ["英文缩写", "常见别称"],
  "definition": "完整定义，≤500字",
  "summary": "一句话摘要，≤100字",
  "confidence": 0.9
}]"""


def _parse_extraction_response(raw: str) -> list[dict]:
    """从 LLM 响应中解析术语 JSON 数组。容错：尝试提取 JSON 块。"""
    if not raw or not raw.strip():
        return []

    # 尝试直接解析
    try:
        result = json.loads(raw)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # 尝试提取 ```json ... ``` 代码块
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if match:
        try:
            result = json.loads(match.group(1))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # 尝试找到第一个 [ ... ] 数组
    match = re.search(r"\[[\s\S]*\]", raw)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    logger.warning(f"concept_extraction_parse_failed raw_len={len(raw)} preview={raw[:200]}")
    return []


# ── 配置 ─────────────────────────────────────────────────────

CONCEPT_EXTRACTION_ENABLED_DEFAULT = True
CONCEPT_MIN_CHUNK_LENGTH_DEFAULT = 500
CONCEPT_MAX_PER_ROUND_DEFAULT = 5
CONCEPT_SUMMARY_MAX_LENGTH_DEFAULT = 200


def _get_concept_config(sys_cfg: SystemConfig | None) -> dict:
    """从 SystemConfig 读取概念配置，NULL 字段回退默认值。"""
    if sys_cfg is None:
        return {
            "enabled": CONCEPT_EXTRACTION_ENABLED_DEFAULT,
            "min_chunk_length": CONCEPT_MIN_CHUNK_LENGTH_DEFAULT,
            "max_per_round": CONCEPT_MAX_PER_ROUND_DEFAULT,
            "summary_max_length": CONCEPT_SUMMARY_MAX_LENGTH_DEFAULT,
        }
    return {
        "enabled": getattr(sys_cfg, "concept_extraction_enabled", CONCEPT_EXTRACTION_ENABLED_DEFAULT),
        "min_chunk_length": getattr(sys_cfg, "concept_min_chunk_length", CONCEPT_MIN_CHUNK_LENGTH_DEFAULT),
        "max_per_round": getattr(sys_cfg, "concept_max_per_round", CONCEPT_MAX_PER_ROUND_DEFAULT),
        "summary_max_length": getattr(sys_cfg, "concept_summary_max_length", CONCEPT_SUMMARY_MAX_LENGTH_DEFAULT),
    }


# ── 抽取主流程 ──────────────────────────────────────────────

async def extract_concepts(
    db: AsyncSession,
    chunks: list[dict],
    sys_cfg: SystemConfig | None = None,
    provider: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> int:
    """从 chunk 列表提取术语概念，去重后写入 kb_concepts。

    chunks: [{"chunk_id": int, "content": str, "kb_id": int}, ...]
    returns: 本次新建/更新的概念数量
    """
    from app.config import settings

    cfg = _get_concept_config(sys_cfg)
    if not cfg["enabled"]:
        logger.info("concept_extraction_disabled")
        return 0

    # provider 回退
    provider = provider or settings.LLM_PROVIDER
    base_url = base_url or settings.LLM_BASE_URL
    model = model or settings.LLM_MODEL
    api_key = api_key or settings.LLM_API_KEY

    # 解析 embedding 配置（用于 concept embedding）
    emb_cfg = await resolve_embedding_config(sys_cfg)
    emb_api_key = emb_cfg.api_key or api_key
    emb_base_url = emb_cfg.base_url or base_url

    total_created = 0
    total_updated = 0

    for ch in chunks:
        chunk_id = ch["chunk_id"]
        content = ch.get("content", "")
        kb_id = ch.get("kb_id", 1)

        # 跳过太短的 chunk
        if len(content) < cfg["min_chunk_length"]:
            continue

        # 调用 LLM 提取术语
        try:
            raw = await generate(
                system_prompt=EXTRACTION_SYSTEM_PROMPT,
                user_prompt=content,
                provider=provider,
                base_url=base_url,
                model=model,
                api_key=api_key,
                temperature=0.0,
            )
        except Exception as exc:
            logger.warning(
                f"concept_extraction_llm_failed chunk_id={chunk_id} error=\"{exc}\""
            )
            continue

        terms = _parse_extraction_response(raw)
        logger.info(
            f"concept_extraction_chunk_result chunk_id={chunk_id} "
            f"chunk_len={len(content)} terms={len(terms)}"
        )

        # 处理每个术语
        positions_global: list[list[int]] = []  # 全局位置（按术语在 content 中出现的位置）
        for term in terms:
            name = term.get("name", "").strip()
            if not name:
                continue

            aliases = term.get("aliases", []) or []
            definition = term.get("definition", "").strip()
            summary = term.get("summary", "").strip()
            confidence = term.get("confidence", 0.0)

            if not definition:
                continue

            # 查找术语在 chunk 中的位置
            positions = []
            try:
                idx = 0
                while True:
                    idx = content.find(name, idx)
                    if idx == -1:
                        break
                    positions.append(idx)
                    idx += len(name)
            except Exception:
                pass

            # 去重：LOWER(name) + kb_id
            existing = (
                await db.execute(
                    select(KbConcept).where(
                        KbConcept.kb_id == kb_id,
                        func.lower(KbConcept.name) == name.lower(),
                    )
                )
            ).scalar_one_or_none()

            if existing:
                # 已存在：如果新版本置信度更高，更新定义
                if confidence > existing.confidence:
                    existing.definition = definition
                    existing.summary = summary or existing.summary
                    existing.aliases = list(set((existing.aliases or []) + aliases))
                    existing.confidence = confidence
                    # 合并 source_chunk_ids
                    merged_sources = list(set((existing.source_chunk_ids or []) + [chunk_id]))
                    existing.source_chunk_ids = merged_sources
                    total_updated += 1
                    logger.info(
                        f"concept_updated name=\"{name}\" id={existing.id} "
                        f"new_confidence={confidence} old_confidence={existing.confidence}"
                    )
                    concept = existing
                else:
                    # 置信度不更高，仅合并 source_chunk_ids
                    merged_sources = list(set((existing.source_chunk_ids or []) + [chunk_id]))
                    existing.source_chunk_ids = merged_sources
                    concept = existing
            else:
                # 新概念
                try:
                    concept_embedding = await embed_text(
                        f"{name}: {definition}",
                        api_key=emb_api_key,
                        base_url=emb_base_url,
                        provider=emb_cfg.provider,
                        model=emb_cfg.model,
                    )
                except Exception as exc:
                    logger.warning(
                        f"concept_embedding_failed name=\"{name}\" error=\"{exc}\""
                    )
                    concept_embedding = None

                concept = KbConcept(
                    kb_id=kb_id,
                    name=name,
                    aliases=aliases,
                    definition=definition,
                    summary=summary,
                    embedding=concept_embedding,
                    source_chunk_ids=[chunk_id],
                    status="auto",
                    confidence=confidence,
                )
                db.add(concept)
                await db.flush()
                total_created += 1
                logger.info(
                    f"concept_created name=\"{name}\" kb_id={kb_id} "
                    f"confidence={confidence}"
                )

            # 关联 chunk ↔ concept
            existing_link = (
                await db.execute(
                    select(KbChunkConcept).where(
                        KbChunkConcept.chunk_id == chunk_id,
                        KbChunkConcept.concept_id == concept.id,
                    )
                )
            ).scalar_one_or_none()

            if not existing_link:
                # 计算 relevance：术语出现次数 / chunk 长度
                relevance = min(1.0, len(positions) / max(len(content.split()), 1) * 50)
                link = KbChunkConcept(
                    chunk_id=chunk_id,
                    concept_id=concept.id,
                    relevance=round(relevance, 4),
                    position=positions[:10],  # 最多保留 10 个位置
                )
                db.add(link)

        # 每个 chunk 后 flush，避免单次失败全部回滚
        try:
            await db.flush()
        except Exception as exc:
            logger.warning(f"concept_extraction_flush_failed chunk_id={chunk_id} error=\"{exc}\"")
            # 继续下一个 chunk
            continue

    try:
        await db.commit()
    except Exception as exc:
        logger.warning(f"concept_extraction_commit_failed error=\"{exc}\"")
        await db.rollback()

    logger.info(
        f"concept_extraction_completed chunks={len(chunks)} "
        f"created={total_created} updated={total_updated}"
    )
    return total_created + total_updated


# ── RAG 上下文注入 ──────────────────────────────────────────

async def get_concepts_for_chunks(
    db: AsyncSession,
    chunk_ids: list[int],
    max_concepts: int = CONCEPT_MAX_PER_ROUND_DEFAULT,
    summary_max_length: int = CONCEPT_SUMMARY_MAX_LENGTH_DEFAULT,
) -> dict[str, str]:
    """查询 chunk 关联的概念摘要，用于 RAG 上下文注入。

    returns: {concept_name: summary_text} — 去重后最多 max_concepts 个
    """
    if not chunk_ids:
        return {}

    result = (
        await db.execute(
            select(
                KbConcept.name,
                KbConcept.summary,
                KbConcept.definition,
                func.max(KbChunkConcept.relevance).label("max_relevance"),
            )
            .join(KbChunkConcept, KbChunkConcept.concept_id == KbConcept.id)
            .where(KbChunkConcept.chunk_id.in_(chunk_ids))
            .group_by(KbConcept.id)
            .order_by(func.max(KbChunkConcept.relevance).desc())
            .limit(max_concepts)
        )
    ).all()

    concepts: dict[str, str] = {}
    for row in result:
        name = row[0]
        summary = row[1]
        definition = row[2]
        # 优先用 summary，其次截断 definition
        text = (summary or definition or "")[:summary_max_length]
        if text:
            concepts[name] = text

    return concepts


# ── CRUD ─────────────────────────────────────────────────────

async def list_concepts(
    db: AsyncSession,
    kb_id: int | None = None,
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """分页列出概念，返回 (concepts_list, total_count)。"""
    conditions = []
    if kb_id is not None:
        conditions.append(KbConcept.kb_id == kb_id)
    if status:
        conditions.append(KbConcept.status == status)
    if search:
        conditions.append(
            (KbConcept.name.ilike(f"%{search}%"))
            | (KbConcept.aliases.any(search))  # type: ignore[union-attr]
        )

    # 总数
    total_q = select(func.count()).select_from(KbConcept)
    if conditions:
        total_q = total_q.where(*conditions)
    total = (await db.execute(total_q)).scalar_one()

    # 分页
    q = select(KbConcept)
    if conditions:
        q = q.where(*conditions)
    q = q.order_by(KbConcept.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    concepts = []
    for c in rows:
        # 统计 chunk_count
        chunk_count = (
            await db.execute(
                select(func.count()).select_from(KbChunkConcept).where(
                    KbChunkConcept.concept_id == c.id
                )
            )
        ).scalar_one()

        # 相关概念：co-occur 最高的其他概念（简化版：top 5 by 共同 chunk 数）
        related_q = (
            select(KbConcept.name, func.count(KbChunkConcept.id).label("cnt"))
            .join(KbChunkConcept, KbChunkConcept.concept_id == KbConcept.id)
            .where(
                KbChunkConcept.chunk_id.in_(
                    select(KbChunkConcept.chunk_id).where(
                        KbChunkConcept.concept_id == c.id
                    ).scalar_subquery()
                ),
                KbConcept.id != c.id,
            )
            .group_by(KbConcept.id)
            .order_by(func.count(KbChunkConcept.id).desc())
            .limit(5)
        )
        related_result = (await db.execute(related_q)).all()
        related_names = [r[0] for r in related_result]

        concepts.append({
            "id": c.id,
            "kb_id": c.kb_id,
            "name": c.name,
            "aliases": c.aliases,
            "definition": c.definition,
            "summary": c.summary,
            "status": c.status,
            "confidence": c.confidence,
            "source_chunk_ids": c.source_chunk_ids,
            "chunk_count": chunk_count,
            "related_concepts": related_names,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        })

    return concepts, total


async def get_concept(db: AsyncSession, concept_id: int) -> dict | None:
    """获取概念详情 + 引用 chunk 列表。"""
    c = await db.get(KbConcept, concept_id)
    if c is None:
        return None

    chunk_count = (
        await db.execute(
            select(func.count()).select_from(KbChunkConcept).where(
                KbChunkConcept.concept_id == c.id
            )
        )
    ).scalar_one()

    # 引用 chunk 详情
    chunks_q = (
        select(
            KbChunkConcept.chunk_id,
            KbChunkConcept.relevance,
            KbChunkConcept.position,
            KbChunk.content,
            KbChunk.page,
            KbDocument.doc_name,
        )
        .join(KbChunk, KbChunk.id == KbChunkConcept.chunk_id)
        .join(KbDocument, KbDocument.id == KbChunk.document_id, isouter=True)
        .where(KbChunkConcept.concept_id == concept_id)
        .order_by(KbChunkConcept.relevance.desc())
        .limit(20)
    )
    chunk_rows = (await db.execute(chunks_q)).all()
    chunks_list = [
        {
            "chunk_id": row.chunk_id,
            "doc_name": row.doc_name or "未知文档",
            "content_preview": (row.content or "")[:200],
            "relevance": float(row.relevance),
            "page": row.page,
        }
        for row in chunk_rows
    ]

    # 相关概念（co-occur）
    related_q = (
        select(KbConcept.name, func.count(KbChunkConcept.id).label("cnt"))
        .join(KbChunkConcept, KbChunkConcept.concept_id == KbConcept.id)
        .where(
            KbChunkConcept.chunk_id.in_(
                select(KbChunkConcept.chunk_id).where(
                    KbChunkConcept.concept_id == c.id
                ).scalar_subquery()
            ),
            KbConcept.id != c.id,
        )
        .group_by(KbConcept.id)
        .order_by(func.count(KbChunkConcept.id).desc())
        .limit(5)
    )
    related_result = (await db.execute(related_q)).all()

    return {
        "id": c.id,
        "kb_id": c.kb_id,
        "name": c.name,
        "aliases": c.aliases,
        "definition": c.definition,
        "summary": c.summary,
        "status": c.status,
        "confidence": c.confidence,
        "source_chunk_ids": c.source_chunk_ids,
        "chunk_count": chunk_count,
        "related_concepts": [r[0] for r in related_result],
        "chunks": chunks_list,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


async def update_concept(
    db: AsyncSession, concept_id: int, definition: str | None = None,
    summary: str | None = None, aliases: list[str] | None = None,
    status: str | None = None,
) -> KbConcept | None:
    """更新概念定义/别名/状态。"""
    c = await db.get(KbConcept, concept_id)
    if c is None:
        return None

    if definition is not None:
        c.definition = definition
    if summary is not None:
        c.summary = summary
    if aliases is not None:
        c.aliases = aliases
    if status is not None:
        c.status = status

    await db.commit()
    await db.refresh(c)
    return c


async def delete_concept(db: AsyncSession, concept_id: int) -> bool:
    """删除概念（CASCADE 自动清理关联记录）。"""
    c = await db.get(KbConcept, concept_id)
    if c is None:
        return False
    await db.delete(c)
    await db.commit()
    return True
