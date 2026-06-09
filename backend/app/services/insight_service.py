"""对话知识沉淀服务 — LLM 提炼 + 去重 + 审核。

从 kb_qa_records 中提取独立知识点，写入 kb_insights，
经用户审核后参与检索。
"""

import asyncio
import json
import time

from loguru import logger
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_COMPLETED
from app.models.external_entry import KbExternalEntry
from app.models.insight import KbInsight
from app.models.qa_record import KbQaRecord
from app.services.monitor_service import write_event
from app.models.session import KbSession
from app.models.system_config import SystemConfig
from app.services.embedding_service import embed_text, resolve_embedding_config
from app.services.llm_service import generate_stream


# ── LLM 提炼 Prompt ─────────────────────────────────────────

INSIGHT_EXTRACTION_SYSTEM = (
    "你是一个知识提炼助手。请从以下对话中提取独立、自包含的知识点，以 JSON 数组返回。"
    "要求：\n"
    "1. 每个知识点有独立标题，脱离对话也能读懂\n"
    "2. 保留所有关键信息，不丢失细节\n"
    "3. 如果对话太浅或信息量不足，跳过不提炼（返回空数组）\n"
    "4. 标注每个知识点的置信度（0-1，越高表示越确定这个知识点有价值）\n"
    "5. 为每个知识点打 1-5 个标签\n\n"
    "返回格式（严格 JSON 数组，不要包含 markdown 代码块标记）：\n"
    '[{"title": "知识点标题", "content": "知识点正文", "confidence": 0.9, "tags": ["tag1", "tag2"], "source_qa_ids": [1]}]'
)


# ── 非流式 LLM 调用 ─────────────────────────────────────────

async def _llm_complete(
    system_prompt: str,
    user_prompt: str,
    provider: str,
    base_url: str,
    model: str,
    api_key: str,
    temperature: float = 0.0,
) -> str:
    """调用 LLM 非流式生成，收集所有 token 拼接为完整响应。"""
    chunks: list[str] = []
    async for token in generate_stream(
        system_prompt, user_prompt,
        provider=provider, base_url=base_url,
        model=model, api_key=api_key,
        temperature=temperature,
    ):
        chunks.append(token)
    return "".join(chunks)


def _parse_extraction_response(response: str) -> list[dict]:
    """解析 LLM 提炼 JSON 响应，支持容错处理。"""
    text = response.strip()
    # 去除可能的 markdown 代码块标记
    if text.startswith("```"):
        lines = text.split("\n")
        # 去掉首行 ```json 和末行 ```
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []
    except json.JSONDecodeError:
        # 尝试提取 JSON 数组片段
        try:
            start = text.index("[")
            end = text.rindex("]") + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            logger.warning(f"insight_extraction_parse_failed response_len={len(response)}")
            return []


# ── 余弦相似度 ──────────────────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """计算两个向量的余弦相似度。"""
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = (sum(x * x for x in a)) ** 0.5
    norm_b = (sum(x * x for x in b)) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ═══════════════════════════════════════════════════════════════
# 公共 API
# ═══════════════════════════════════════════════════════════════

async def extract_insights(
    db: AsyncSession,
    sys_cfg: SystemConfig,
) -> dict[str, int]:
    """批处理提炼：从 kb_qa_records + kb_external_entries 提取知识点。

    统一管道——仅数据来源不同，LLM 提炼 / 去重 / embedding / 入库完全一致。
    """
    t_start = time.time()
    stats: dict[str, int] = {
        "extracted": 0, "skipped_short": 0,
        "skipped_duplicate": 0, "auto_approved": 0, "errors": 0,
    }
    min_len = sys_cfg.insight_min_answer_length

    # ── Step 1：收集待处理项（原生 QA + 外部条目）─────────────

    # 原生 QA 已引用 ID 去重
    native_used = {row[0] for row in (await db.execute(
        select(func.unnest(KbInsight.source_qa_ids))
    )).all()}

    # 外部条目已引用 ID 去重
    external_used = {row[0] for row in (await db.execute(
        select(func.unnest(KbInsight.external_entry_ids))
    )).all()}

    # 统一的待处理项列表
    items: list[dict] = []

    # — 原生 QA（48h 窗口）—
    qa_stmt = (
        select(KbQaRecord, KbSession)
        .join(KbSession, KbQaRecord.session_id == KbSession.id)
        .where(
            func.length(KbQaRecord.answer) >= min_len,
            KbQaRecord.created_at > func.now() - text("INTERVAL '48 hours'"),
        )
        .order_by(KbQaRecord.created_at.desc())
        .limit(50)
    )
    for qa, sess in (await db.execute(qa_stmt)).all():
        if qa.id not in native_used:
            items.append({
                "question": qa.question,
                "answer": qa.answer,
                "source_type": "native",
                "source_id": qa.id,
                "target_kb_id": sess.kb_id if sess else _SYSTEM_KB_ID,
            })

    # — 外部条目（不限时间窗口）—
    entry_stmt = (
        select(KbExternalEntry)
        .where(
            KbExternalEntry.status == "pending",
            KbExternalEntry.kb_id == _SYSTEM_KB_ID,
            func.length(KbExternalEntry.answer) >= min_len,
        )
        .order_by(KbExternalEntry.created_at.desc())
        .limit(50)
    )
    for entry in (await db.execute(entry_stmt)).scalars().all():
        if entry.id not in external_used:
            items.append({
                "question": entry.question,
                "answer": entry.answer,
                "source_type": "external",
                "source_id": entry.id,
                "target_kb_id": entry.kb_id,
            })

    if not items:
        logger.info("insight_extraction_no_unprocessed")
        return stats

    native_count = sum(1 for i in items if i["source_type"] == "native")
    external_count = sum(1 for i in items if i["source_type"] == "external")
    logger.info(
        f"insight_extraction_candidates native={native_count} external={external_count}"
    )
    await write_event(db, category="insight", event="insight_batch_started",
        value_int=len(items), status="success",
        extra_json={"native": native_count, "external": external_count})

    # ── Step 2：获取 LLM 配置 ─────────────────────────────────
    emb_cfg = await resolve_embedding_config(sys_cfg)

    provider = sys_cfg.llm_provider or "ollama"
    model = sys_cfg.llm_model or "qwen3"
    base_url = sys_cfg.llm_base_url or "http://localhost:11434"
    api_key = sys_cfg.llm_api_key or ""

    # ── Step 3：批量调 LLM 提炼（统一 prompt，不区分来源）───
    BATCH_SIZE = 10
    all_candidates: list[dict] = []

    for batch_start in range(0, len(items), BATCH_SIZE):
        batch = items[batch_start:batch_start + BATCH_SIZE]

        qa_parts = []
        for item in batch:
            qa_parts.append(f"Q: {item['question']}\nA: {item['answer'][:1000]}")
        user_prompt = "以下是对话记录，请提炼知识点：\n" + "\n---\n".join(
            f"{i+1}. {p}" for i, p in enumerate(qa_parts)
        )

        try:
            response = await _llm_complete(
                INSIGHT_EXTRACTION_SYSTEM, user_prompt,
                provider=provider, base_url=base_url,
                model=model, api_key=api_key, temperature=0.0,
            )
            extracted = _parse_extraction_response(response)

            # 对齐 source ID（LLM 序号 → 真实记录 ID，保留来源类型）
            for ext_item in extracted:
                raw_indices = ext_item.get("source_qa_ids", [])
                native_ids: list[int] = []
                external_ids: list[int] = []
                for idx in raw_indices:
                    if 1 <= idx <= len(batch):
                        bi = batch[idx - 1]
                        if bi["source_type"] == "native":
                            native_ids.append(bi["source_id"])
                        else:
                            external_ids.append(bi["source_id"])

                # 纯外部来源 → source_type=external，否则保持 native
                ext_item["source_qa_ids"] = native_ids
                ext_item["external_entry_ids"] = external_ids
                ext_item["_source_type"] = "external" if (external_ids and not native_ids) else "native"
                # 目标 KB：取第一条来源的 target_kb_id
                first_i = min(raw_indices[0] - 1, len(batch) - 1) if raw_indices else 0
                ext_item["_target_kb_id"] = batch[first_i]["target_kb_id"]
                all_candidates.append(ext_item)

            logger.info(
                f"insight_llm_batch batch={batch_start // BATCH_SIZE + 1} "
                f"item_count={len(batch)} extracted={len(extracted)}"
            )

        except Exception as exc:
            logger.error(f"insight_llm_failed batch={batch_start // BATCH_SIZE + 1} error=\"{exc}\"")
            stats["errors"] += 1
            continue

    if not all_candidates:
        return stats

    # ── Step 4：查询已有 approved insight（用于向量去重）──────
    existing_stmt = (
        select(KbInsight.id, KbInsight.title, KbInsight.embedding)
        .where(KbInsight.status == "approved")
    )
    existing = (await db.execute(existing_stmt)).all()
    existing_embeddings = [(e.id, e.title, e.embedding) for e in existing if e.embedding is not None]

    dedup_threshold = sys_cfg.insight_dedup_threshold
    auto_threshold = sys_cfg.insight_auto_approve_confidence

    # ── Step 5：去重 + embedding + 写入（统一，按来源标记）───
    processed_external_ids: set[int] = set()

    for candidate in all_candidates:
        title = candidate.get("title", "").strip()
        content = candidate.get("content", "").strip()
        confidence = float(candidate.get("confidence", 0.0))
        tags = candidate.get("tags", [])
        source_qa_ids = candidate.get("source_qa_ids", [])
        external_entry_ids = candidate.get("external_entry_ids", [])
        source_type = candidate.get("_source_type", "native")
        target_kb_id = candidate.get("_target_kb_id", _SYSTEM_KB_ID)

        if not title or not content or (not source_qa_ids and not external_entry_ids):
            stats["skipped_short"] += 1
            continue

        # ID 去重（两种来源各自独立的 ID 空间）
        if (set(source_qa_ids) & native_used) or (set(external_entry_ids) & external_used):
            stats["skipped_duplicate"] += 1
            continue

        # 生成 embedding
        try:
            embedding = await embed_text(
                title + "\n" + content,
                api_key=emb_cfg.api_key,
                base_url=emb_cfg.base_url,
                provider=emb_cfg.provider,
                model=emb_cfg.model,
            )
        except Exception as exc:
            logger.error(f"insight_embedding_failed title=\"{title[:50]}\" error=\"{exc}\"")
            stats["errors"] += 1
            continue

        # 向量去重（与所有 approved insights 比较）
        dup = False
        for eid, etitle, eemb in existing_embeddings:
            if _cosine_similarity(embedding, eemb) >= dedup_threshold:
                logger.info(f"insight_dedup_vector title=\"{title[:50]}\" similar_to=\"{etitle[:50]}\" id={eid}")
                dup = True
                break
        if dup:
            stats["skipped_duplicate"] += 1
            continue

        # 标记已处理
        native_used |= set(source_qa_ids)
        external_used |= set(external_entry_ids)
        processed_external_ids |= set(external_entry_ids)

        auto_approved = confidence >= auto_threshold
        status = "approved" if auto_approved else "pending"

        insight = KbInsight(
            kb_id=_SYSTEM_KB_ID,
            target_kb_id=target_kb_id,
            title=title,
            content=content,
            embedding=embedding,
            source_type=source_type,
            source_qa_ids=source_qa_ids,
            external_entry_ids=external_entry_ids if external_entry_ids else None,
            status=status,
            confidence=confidence,
            tags=tags,
        )
        if auto_approved:
            insight.reviewed_at = func.now()

        db.add(insight)
        await db.flush()

        # 自动通过 → 落地为 kb_chunk
        if auto_approved:
            await _insight_to_chunk(db, insight)

        stats["extracted"] += 1
        if auto_approved:
            stats["auto_approved"] += 1

    # ── Step 6：更新外部条目状态为 extracted ────────────────
    if processed_external_ids:
        entries_to_update = (await db.execute(
            select(KbExternalEntry).where(
                KbExternalEntry.id.in_(list(processed_external_ids))
            )
        )).scalars().all()
        for entry in entries_to_update:
            entry.status = "extracted"
            entry.extracted_at = func.now()

    await db.flush()

    elapsed = round((time.time() - t_start) * 1000)
    logger.info(
        f"insight_extraction_completed extracted={stats['extracted']} "
        f"skipped_short={stats['skipped_short']} skipped_duplicate={stats['skipped_duplicate']} "
        f"auto_approved={stats['auto_approved']} errors={stats['errors']} elapsed_ms={elapsed}"
    )
    await write_event(db, category="insight", event="insight_batch_completed",
        value_int=stats["extracted"], value_float=elapsed / 1000,
        status="success" if stats["errors"] == 0 else "warning",
        extra_json={"skipped": stats["skipped_short"] + stats["skipped_duplicate"],
                    "errors": stats["errors"], "auto_approved": stats["auto_approved"]})

    return stats


async def list_insights(
    db: AsyncSession,
    kb_id: int | None = None,
    status: str | None = None,
    source_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[KbInsight], int]:
    """分页查询 insight 列表（审核管理用）。"""
    filters = []
    if kb_id is not None:
        filters.append(KbInsight.kb_id == kb_id)
    if status is not None:
        filters.append(KbInsight.status == status)
    if source_type is not None:
        filters.append(KbInsight.source_type == source_type)

    count_stmt = select(func.count(KbInsight.id)).where(*filters)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(KbInsight)
        .where(*filters)
        .order_by(KbInsight.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return list(rows), total


async def get_insight(db: AsyncSession, insight_id: int) -> KbInsight | None:
    """获取单条 insight。"""
    return await db.get(KbInsight, insight_id)


async def delete_insight(db: AsyncSession, insight_id: int) -> int | None:
    """删除 insight，同时清理关联 chunk 和空文档。返回 deleted_id 或 None。"""
    insight = await db.get(KbInsight, insight_id)
    if insight is None:
        return None

    # 查关联 chunk（审核通过后才有）
    chunks = (await db.execute(
        select(KbChunk).where(KbChunk.source_insight_id == insight_id)
    )).scalars().all()

    for chunk in chunks:
        doc = await db.get(KbDocument, chunk.document_id)
        if doc:
            doc.chunk_count = max(0, doc.chunk_count - 1)
            # chunk_count 归零 → 删虚拟文档
            if doc.chunk_count == 0:
                await db.delete(doc)
        await db.delete(chunk)

    await db.delete(insight)

    logger.info(f"insight_deleted id={insight_id} chunks_cleaned={len(chunks)}")
    return insight_id


# 系统知识库 ID（所有 insight 统一归集到这里）
_SYSTEM_KB_ID = 1


async def _insight_to_chunk(db: AsyncSession, insight: KbInsight) -> None:
    """将审核通过的 insight 落地为 kb_chunk，写到 target_kb_id 对应 KB 的「知识沉淀」虚拟文档下。"""
    target_kb = insight.target_kb_id or insight.kb_id

    # 查找或创建该目标 KB 的知识沉淀虚拟文档
    doc = (await db.execute(
        select(KbDocument).where(
            KbDocument.kb_id == target_kb,
            KbDocument.doc_name == "💡 知识沉淀",
            KbDocument.deleted_at.is_(None),
        )
    )).scalar_one_or_none()

    if doc is None:
        doc = KbDocument(
            kb_id=target_kb,
            doc_name="💡 知识沉淀",
            doc_type="md",
            doc_desc="从对话中自动提炼的知识点集合",
            file_path=f"/_virtual_/insights/{target_kb}",
            status=DOC_STATUS_COMPLETED,
            chunk_count=0,
            source="insight",
        )
        db.add(doc)
        await db.flush()

    chunk = KbChunk(
        document_id=doc.id,
        chunk_index=doc.chunk_count,
        content=f"# {insight.title}\n\n{insight.content}",
        embedding=insight.embedding,
        page=None,
        source_type="insight",
        source_insight_id=insight.id,
    )
    db.add(chunk)
    doc.chunk_count += 1
    await db.flush()

    logger.info(
        f"insight_to_chunk insight_id={insight.id} doc_id={doc.id} "
        f"chunk_index={chunk.chunk_index} title=\"{insight.title[:50]}\""
    )

    # 摄入时即时重复检测（非阻塞：失败不影响 insight 审核）
    try:
        from app.services.health_service import check_new_content_duplicates
        dup_result = await check_new_content_duplicates(
            db, target_kb, [chunk.id], auto_merge=True,
        )
        if dup_result["duplicates_found"] > 0:
            logger.info(
                f"insight_duplicate_check insight_id={insight.id} chunk_id={chunk.id} "
                f"found={dup_result['duplicates_found']} "
                f"auto_superseded={dup_result['auto_superseded']}"
            )
    except Exception:
        logger.warning(
            f"insight_duplicate_check_failed insight_id={insight.id} chunk_id={chunk.id}"
        )


async def review_insight(
    db: AsyncSession,
    insight_id: int,
    status: str,
    target_kb_id: int | None = None,
) -> KbInsight | None:
    """审核通过/拒绝 insight。通过时自动落地为 kb_chunk。

    target_kb_id 可选覆盖预填的目标 KB（用于审核时用户选择不同 KB）。
    """
    insight = await db.get(KbInsight, insight_id)
    if insight is None:
        raise AppException(code=2001, message="知识点不存在", status_code=404)

    if insight.status != "pending":
        raise AppException(code=1001, message="只能审核待审核状态的知识点", status_code=400)

    insight.status = status
    insight.reviewed_at = func.now()

    # 审核通过 → 覆盖 target_kb_id（如提供）并落地为 kb_chunk
    if status == "approved":
        if target_kb_id is not None:
            insight.target_kb_id = target_kb_id
        await _insight_to_chunk(db, insight)

    await db.flush()
    logger.info(
        f"insight_{status} id={insight_id} title=\"{insight.title[:50]}\" "
        f"target_kb={insight.target_kb_id}"
    )

    return insight


async def update_insight_target_kb(
    db: AsyncSession,
    insight_id: int,
    new_kb_id: int,
) -> KbInsight:
    """更新 insight 的目标 KB。若已审核通过，同步迁移 chunk。"""
    insight = await db.get(KbInsight, insight_id)
    if insight is None:
        raise AppException(code=2001, message="知识点不存在", status_code=404)

    old_kb_id = insight.target_kb_id or insight.kb_id

    if old_kb_id == new_kb_id:
        return insight

    # — 迁 chunk：旧 KB 删 → 新 KB 建 —
    if insight.status == "approved":
        # 查找旧 chunk
        old_chunks = (await db.execute(
            select(KbChunk).where(KbChunk.source_insight_id == insight_id)
        )).scalars().all()

        # 删除旧 chunk + 更新旧文档 chunk_count
        for chunk in old_chunks:
            old_doc = await db.get(KbDocument, chunk.document_id)
            if old_doc and old_doc.chunk_count > 0:
                old_doc.chunk_count -= 1
            await db.delete(chunk)

        # 在新 KB 重建 chunk
        old_target = insight.target_kb_id
        insight.target_kb_id = new_kb_id
        await _insight_to_chunk(db, insight)
        # 恢复 target_kb_id（_insight_to_chunk 里用这个字段）
        insight.target_kb_id = new_kb_id
    else:
        insight.target_kb_id = new_kb_id

    await db.flush()

    logger.info(
        f"insight_target_kb_changed id={insight_id} "
        f"old_kb={old_kb_id} new_kb={new_kb_id} status={insight.status}"
    )

    return insight


async def save_insight_from_qa(
    db: AsyncSession,
    qa_record_id: int,
    kb_id: int,
    sys_cfg: SystemConfig,
) -> tuple[KbInsight | None, dict | None]:
    """手动触发单条 QA 记录的知识点提炼（同步验证 + 创建 placeholder，立即返回）。

    返回 (placeholder_insight, bg_config)。调用方 commit 后应通过
    asyncio.create_task(process_insight_background(bg_config)) 后台完成 LLM 提炼。
    """
    qa = await db.get(KbQaRecord, qa_record_id)
    if qa is None:
        raise AppException(code=2001, message="QA 记录不存在", status_code=404)

    if len(qa.answer) < 50:
        raise AppException(code=1001, message="回答太短，无法提炼知识点", status_code=400)

    # 检查是否已提炼过（该 QA 已存在于某个 insight 的 source_qa_ids 中）
    dup_check = await db.execute(
        select(KbInsight.id).where(KbInsight.source_qa_ids.overlap([qa_record_id]))
    )
    if dup_check.scalar_one_or_none() is not None:
        raise AppException(code=1001, message="该回答已提炼过知识点", status_code=409)

    # 创建 processing 占位记录，立即返回
    placeholder = KbInsight(
        kb_id=_SYSTEM_KB_ID,
        target_kb_id=kb_id,
        title="提炼中...",
        content="",
        embedding=None,
        source_qa_ids=[qa_record_id],
        source_doc_ids=None,
        status="processing",
        confidence=0.0,
        tags=[],
    )
    db.add(placeholder)
    await db.flush()

    bg_config = {
        "insight_id": placeholder.id,
        "qa_record_id": qa_record_id,
        "kb_id": kb_id,
        "question": qa.question,
        "answer": qa.answer,
    }

    logger.info(f"insight_save_async qa_id={qa_record_id} insight_id={placeholder.id}")

    return placeholder, bg_config


async def process_insight_background(config: dict) -> None:
    """后台异步任务：LLM 提炼 + embedding + 更新 insight 状态。

    独立管理 DB 会话，不依赖请求级 db。
    """
    from app.core.database import AsyncSessionLocal

    insight_id = config["insight_id"]
    qa_record_id = config["qa_record_id"]
    kb_id = config["kb_id"]
    question = config["question"]
    answer = config["answer"]

    async with AsyncSessionLocal() as db:
        try:
            insight = await db.get(KbInsight, insight_id)
            if insight is None:
                logger.error(f"insight_bg_not_found id={insight_id}")
                return

            # 加载系统配置
            sys_cfg = (await db.execute(
                select(SystemConfig).where(SystemConfig.id == 1)
            )).scalar_one_or_none()
            if sys_cfg is None:
                sys_cfg = SystemConfig(id=1)
                db.add(sys_cfg)
                await db.flush()

            emb_cfg = await resolve_embedding_config(sys_cfg)
            provider = sys_cfg.llm_provider or "ollama"
            model = sys_cfg.llm_model or "qwen3"
            base_url = sys_cfg.llm_base_url or "http://localhost:11434"
            api_key = sys_cfg.llm_api_key or ""

            user_prompt = f"请从以下对话中提炼知识点：\nQ: {question}\nA: {answer[:2000]}"

            # LLM 提炼
            try:
                response = await _llm_complete(
                    INSIGHT_EXTRACTION_SYSTEM, user_prompt,
                    provider=provider, base_url=base_url,
                    model=model, api_key=api_key, temperature=0.0,
                )
                candidates = _parse_extraction_response(response)
            except Exception as exc:
                logger.error(f"insight_bg_llm_failed id={insight_id} error=\"{exc}\"")
                await write_event(db, category="insight", event="insight_llm_failed",
                    value_int=insight_id, status="failed", message=str(exc)[:200])
                insight.status = "rejected"
                insight.content = f"[LLM 提炼失败: {exc}]"
                await db.commit()
                return

            if not candidates:
                insight.status = "rejected"
                insight.content = "[LLM 未能提炼出有效知识点]"
                await db.commit()
                logger.info(f"insight_bg_empty id={insight_id}")
                return

            candidate = candidates[0]
            title = candidate.get("title", "").strip()
            content = candidate.get("content", "").strip()
            confidence = float(candidate.get("confidence", 0.0))
            tags = candidate.get("tags", [])

            if not title or not content:
                insight.status = "rejected"
                insight.content = "[LLM 返回内容不完整]"
                await db.commit()
                return

            # 生成 embedding
            try:
                embedding = await embed_text(
                    title + "\n" + content,
                    api_key=emb_cfg.api_key,
                    base_url=emb_cfg.base_url,
                    provider=emb_cfg.provider,
                    model=emb_cfg.model,
                )
            except Exception as exc:
                logger.error(f"insight_bg_embedding_failed id={insight_id} error=\"{exc}\"")
                insight.status = "rejected"
                insight.content = f"[Embedding 生成失败: {exc}]"
                await db.commit()
                return

            auto_threshold = sys_cfg.insight_auto_approve_confidence
            auto_approved = confidence >= auto_threshold

            insight.title = title
            insight.content = content
            insight.embedding = embedding
            insight.confidence = confidence
            insight.tags = tags
            insight.status = "approved" if auto_approved else "pending"

            if auto_approved:
                insight.reviewed_at = func.now()
                await _insight_to_chunk(db, insight)

            await db.commit()

            logger.info(
                f"insight_bg_completed id={insight_id} qa_id={qa_record_id} "
                f"title=\"{title[:50]}\" auto_approved={auto_approved}"
            )

        except Exception as exc:
            logger.error(f"insight_bg_unexpected id={insight_id} error=\"{exc}\"")
            # 最后一搏：标记失败
            try:
                async with AsyncSessionLocal() as fail_db:
                    await write_event(fail_db, category="insight", event="insight_bg_processing_failed",
                        value_int=insight_id, status="failed", message=str(exc)[:200])
                    fail_insight = await fail_db.get(KbInsight, insight_id)
                    if fail_insight and fail_insight.status == "processing":
                        fail_insight.status = "rejected"
                        fail_insight.content = f"[后台处理异常: {exc}]"
                        await fail_db.commit()
            except Exception:
                logger.error(f"insight_bg_fail_marker_failed id={insight_id}")
