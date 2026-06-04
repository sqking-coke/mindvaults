"""对话知识沉淀服务 — LLM 提炼 + 去重 + 审核。

从 kb_qa_records 中提取独立知识点，写入 kb_insights，
经用户审核后参与检索。
"""

import json
import time

from loguru import logger
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_COMPLETED
from app.models.insight import KbInsight
from app.models.qa_record import KbQaRecord
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
    """批处理提炼：从未处理的 QA 记录中提取知识点。

    返回统计字典：{extracted, skipped_short, skipped_duplicate, auto_approved, errors}
    """
    t_start = time.time()
    stats: dict[str, int] = {
        "extracted": 0, "skipped_short": 0,
        "skipped_duplicate": 0, "auto_approved": 0, "errors": 0,
    }

    # ── Step 1：查询未处理的 QA 记录 ─────────────────────────
    # 条件：答案长度 >= min_answer_length，且尚未被任何 insight 引用
    min_len = sys_cfg.insight_min_answer_length

    # 子查询：所有已被 insight 引用的 source_qa_id（展开 ARRAY）
    used_ids_query = select(func.unnest(KbInsight.source_qa_ids)).subquery()
    used_ids = {row[0] for row in (await db.execute(select(used_ids_query.c[0]))).all()}

    # 查询符合条件的 QA 记录
    qa_stmt = (
        select(KbQaRecord, KbSession)
        .join(KbSession, KbQaRecord.session_id == KbSession.id)
        .where(
            func.length(KbQaRecord.answer) >= min_len,
            KbQaRecord.created_at > func.now() - text("INTERVAL '48 hours'"),
        )
        .order_by(KbQaRecord.created_at.desc())
        .limit(50)  # 每次最多处理 50 条
    )
    qa_rows = (await db.execute(qa_stmt)).all()

    # 过滤已处理
    unprocessed = [(qa, sess) for qa, sess in qa_rows if qa.id not in used_ids]
    if not unprocessed:
        logger.info("insight_extraction_no_unprocessed_qa")
        return stats

    logger.info(f"insight_extraction_candidates total={len(unprocessed)}")

    # ── Step 2：获取 LLM 配置 ─────────────────────────────────
    emb_cfg = await resolve_embedding_config(sys_cfg)

    provider = sys_cfg.llm_provider or "ollama"
    model = sys_cfg.llm_model or "qwen3"
    base_url = sys_cfg.llm_base_url or "http://localhost:11434"
    api_key = sys_cfg.llm_api_key or ""

    # ── Step 3：批量调 LLM 提炼 ─────────────────────────────
    # 分批处理，每批最多 10 条 QA
    BATCH_SIZE = 10
    all_candidates: list[dict] = []

    for batch_start in range(0, len(unprocessed), BATCH_SIZE):
        batch = unprocessed[batch_start:batch_start + BATCH_SIZE]

        # 构建 user prompt
        qa_items = []
        for qa, sess in batch:
            qa_items.append(
                f"Q: {qa.question}\\nA: {qa.answer[:1000]}"  # 截断过长的回答
            )
        user_prompt = "以下是对话记录，请提炼知识点：\\n" + "\\n---\\n".join(
            f"{i+1}. {item}" for i, item in enumerate(qa_items)
        )

        try:
            response = await _llm_complete(
                INSIGHT_EXTRACTION_SYSTEM, user_prompt,
                provider=provider, base_url=base_url,
                model=model, api_key=api_key, temperature=0.0,
            )
            extracted = _parse_extraction_response(response)

            # 对齐 source_qa_ids（LLM 返回的序号 → 真实 qa_record.id）
            for item in extracted:
                raw_indices = item.get("source_qa_ids", [])
                real_ids = []
                for idx in raw_indices:
                    if 1 <= idx <= len(batch):
                        real_ids.append(batch[idx - 1][0].id)
                item["source_qa_ids"] = real_ids
                all_candidates.append(item)

            logger.info(
                f"insight_llm_batch batch={batch_start // BATCH_SIZE + 1} "
                f"qa_count={len(batch)} extracted={len(extracted)}"
            )

        except Exception as exc:
            logger.error(f"insight_llm_failed batch={batch_start // BATCH_SIZE + 1} error=\"{exc}\"")
            stats["errors"] += 1
            continue

    if not all_candidates:
        return stats

    # ── Step 4：查询已有 approved insight（用于去重） ──────────
    existing_stmt = (
        select(KbInsight.id, KbInsight.title, KbInsight.embedding)
        .where(KbInsight.status == "approved")
    )
    existing = (await db.execute(existing_stmt)).all()
    existing_embeddings = [(e.id, e.title, e.embedding) for e in existing if e.embedding is not None]

    dedup_threshold = sys_cfg.insight_dedup_threshold
    auto_threshold = sys_cfg.insight_auto_approve_confidence

    # ── Step 5：去重 + 生成 embedding + 写入 ──────────────────
    for candidate in all_candidates:
        title = candidate.get("title", "").strip()
        content = candidate.get("content", "").strip()
        confidence = float(candidate.get("confidence", 0.0))
        tags = candidate.get("tags", [])
        source_qa_ids = candidate.get("source_qa_ids", [])

        if not title or not content or not source_qa_ids:
            stats["skipped_short"] += 1
            continue

        # ID 去重
        qa_set = set(source_qa_ids)
        if qa_set & used_ids:
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

        # 向量去重（仅与 approved insights 比）
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
        used_ids |= qa_set

        # 追溯 target_kb_id（从第一条 QA 的 session 推断，审核时可改）
        qa_first = (await db.execute(
            select(KbQaRecord).where(KbQaRecord.id == source_qa_ids[0])
        )).scalar_one_or_none()
        sess = None
        if qa_first:
            sess = (await db.execute(
                select(KbSession).where(KbSession.id == qa_first.session_id)
            )).scalar_one_or_none()
        target_kb_id = sess.kb_id if sess else 1

        # 存放 KB = 沉积库（统一入口）
        sys_kb = _SYSTEM_KB_ID

        # 置信度 >= auto_approve 阈值 → 自动通过
        auto_approved = confidence >= auto_threshold
        status = "approved" if auto_approved else "pending"

        insight = KbInsight(
            kb_id=sys_kb,
            target_kb_id=target_kb_id,
            title=title,
            content=content,
            embedding=embedding,
            source_qa_ids=source_qa_ids,
            source_doc_ids=candidate.get("source_doc_ids"),
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

    await db.flush()

    elapsed = round((time.time() - t_start) * 1000)
    logger.info(
        f"insight_extraction_completed extracted={stats['extracted']} "
        f"skipped_short={stats['skipped_short']} skipped_duplicate={stats['skipped_duplicate']} "
        f"auto_approved={stats['auto_approved']} errors={stats['errors']} elapsed_ms={elapsed}"
    )

    return stats


async def list_insights(
    db: AsyncSession,
    kb_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[KbInsight], int]:
    """分页查询 insight 列表（审核管理用）。"""
    filters = []
    if kb_id is not None:
        filters.append(KbInsight.kb_id == kb_id)
    if status is not None:
        filters.append(KbInsight.status == status)

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


async def save_insight_from_qa(
    db: AsyncSession,
    qa_record_id: int,
    kb_id: int,
    sys_cfg: SystemConfig,
) -> KbInsight | None:
    """手动触发单条 QA 记录的知识点提炼。"""
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

    emb_cfg = await resolve_embedding_config(sys_cfg)
    provider = sys_cfg.llm_provider or "ollama"
    model = sys_cfg.llm_model or "qwen3"
    base_url = sys_cfg.llm_base_url or "http://localhost:11434"
    api_key = sys_cfg.llm_api_key or ""

    user_prompt = f"请从以下对话中提炼知识点：\nQ: {qa.question}\nA: {qa.answer[:2000]}"

    try:
        response = await _llm_complete(
            INSIGHT_EXTRACTION_SYSTEM, user_prompt,
            provider=provider, base_url=base_url,
            model=model, api_key=api_key, temperature=0.0,
        )
        candidates = _parse_extraction_response(response)
    except Exception as exc:
        logger.error(f"insight_save_llm_failed qa_id={qa_record_id} error=\"{exc}\"")
        raise AppException(code=5001, message=f"LLM 提炼失败: {exc}", status_code=502)

    if not candidates:
        return None

    # 取第一个提炼结果
    candidate = candidates[0]
    title = candidate.get("title", "").strip()
    content = candidate.get("content", "").strip()
    confidence = float(candidate.get("confidence", 0.0))
    tags = candidate.get("tags", [])

    if not title or not content:
        return None

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
        logger.error(f"insight_save_embedding_failed title=\"{title[:50]}\" error=\"{exc}\"")
        raise

    auto_threshold = sys_cfg.insight_auto_approve_confidence
    auto_approved = confidence >= auto_threshold

    insight = KbInsight(
        kb_id=_SYSTEM_KB_ID,    # 统一归集到系统库
        target_kb_id=kb_id,     # 预填用户当前 KB（审核时可改）
        title=title,
        content=content,
        embedding=embedding,
        source_qa_ids=[qa_record_id],
        source_doc_ids=None,
        status="approved" if auto_approved else "pending",
        confidence=confidence,
        tags=tags,
    )
    db.add(insight)
    await db.flush()

    # 自动通过 → 落地为 kb_chunk
    if auto_approved:
        await _insight_to_chunk(db, insight)

    logger.info(
        f"insight_saved_manual qa_id={qa_record_id} insight_id={insight.id} "
        f"title=\"{title[:50]}\" auto_approved={auto_approved}"
    )

    return insight
