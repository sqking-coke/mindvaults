import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator

from loguru import logger
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppException
from app.models.qa_record import KbQaRecord
from app.models.session import KbSession
from app.schemas.chat import ChatRequest, RefChunk
from app.services.embedding_service import embed_text
from app.services.retrieval_service import retrieve_chunks
from app.services.llm_service import generate_stream


MAX_HISTORY_TURNS = 5

INTENT_PATTERNS = [
    (["什么是", "如何", "怎么", "为什么", "原理", "架构", "设计", "区别", "配置"], "knowledge_qa"),
    (["查找", "搜索", "列出", "有哪些", "找一下"], "document_lookup"),
    (["你好", "谢谢", "再见", "帮助", "你是谁"], "chitchat"),
]

DEFAULT_SYSTEM_PROMPT = (
    "你是一个基于本地知识库的智能问答助手。"
    "请严格根据以下提供的参考文档内容回答用户问题。"
    "如果参考文档中没有相关信息，请明确告知用户，不要编造内容。"
    "回答时引用具体的文档名称。"
)


def _classify_intent(question: str) -> str:
    for keywords, intent in INTENT_PATTERNS:
        for kw in keywords:
            if kw in question:
                return intent
    return "knowledge_qa"


async def _build_history(db: AsyncSession, session_id: int) -> str:
    rows = (
        await db.execute(
            select(KbQaRecord)
            .where(KbQaRecord.session_id == session_id)
            .order_by(desc(KbQaRecord.created_at))
            .limit(MAX_HISTORY_TURNS)
        )
    ).scalars().all()

    if not rows:
        return ""

    parts = ["\n## 对话历史\n"]
    for r in reversed(rows):
        parts.append(f"用户: {r.question}\n助手: {r.answer}\n")
    return "\n".join(parts)


def _build_context(chunks: list[RefChunk]) -> str:
    """将检索到的切片组装成 LLM 上下文。"""
    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(f"[{i}] 来源: {c.doc_name}\n{c.content}")
    return "\n\n".join(parts)


class _SafeJsonEncoder(json.JSONEncoder):
    """防御 JSON 编码器 — 处理 pgvector 可能带入的 numpy 标量类型。"""

    def default(self, o):
        # numpy.float32 / float64 → Python float
        if hasattr(o, "item") and callable(o.item):
            try:
                return float(o.item())
            except (TypeError, ValueError):
                pass
        return super().default(o)


async def _push_thinking(session_id: str, round_key: str, step: dict) -> None:
    """将推理步骤写入 Redis LIST，按轮次隔离（非阻塞，Redis 不可用时静默跳过）。"""
    try:
        from app.core.redis import get_redis
        from app.config import settings
        redis = await get_redis()
        key = f"mv:thinking:{session_id}:{round_key}"
        await asyncio.wait_for(
            redis.lpush(key, json.dumps(step, cls=_SafeJsonEncoder)), timeout=2.0
        )
        await asyncio.wait_for(redis.expire(key, settings.THINKING_TTL_SECONDS), timeout=2.0)
    except Exception:
        logger.warning(
            f"redis_push_thinking_failed session_id={session_id} "
            f"round_key={round_key} phase={step.get('phase')}"
        )


async def chat_stream(
    db: AsyncSession, req: ChatRequest
) -> AsyncGenerator[tuple[str, str], None]:
    """RAG 流式问答主流程，yield (event_type, json_data) 元组。"""
    t_start = time.time()
    round_key = uuid.uuid4().hex[:8]  # 本轮唯一标识，隔离 Redis 推理步骤

    # 先发送 start 事件，让客户端立即知道流已建立，防止阻塞操作导致前端一直"等待中"
    yield ("start", json.dumps({"status": "processing"}))

    # — 0. 提前获取配置 —
    from app.models.system_config import SystemConfig
    from app.services.retrieval_service import get_config_by_kb
    from app.services.embedding_service import resolve_embedding_config
    from app.services.kb_router import resolve_kb

    sys_cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
    if sys_cfg is None:
        sys_cfg = SystemConfig(id=1)
        db.add(sys_cfg)
        await db.flush()

    provider = sys_cfg.llm_provider if sys_cfg.llm_provider is not None else settings.LLM_PROVIDER
    model = sys_cfg.llm_model if sys_cfg.llm_model is not None else settings.LLM_MODEL
    api_key = sys_cfg.llm_api_key if sys_cfg.llm_api_key is not None else settings.LLM_API_KEY
    base_url = sys_cfg.llm_base_url if sys_cfg.llm_base_url is not None else settings.LLM_BASE_URL

    emb_cfg = await resolve_embedding_config(sys_cfg)
    provider_label = "Ollama (本地)" if provider == "ollama" else "云端 API"

    logger.info(
        f"rag_chat_start session_id={req.session_id} kb_id={req.kb_id or 'auto'} "
        f"provider={provider} model={model} question_len={len(req.question)}"
    )

    # — 1. 会话校验/创建 —
    try:
        session = (
            await db.execute(
                select(KbSession).where(KbSession.session_id == req.session_id)
            )
        ).scalar_one_or_none()
    except Exception as exc:
        logger.error(f"rag_session_lookup_failed session_id={req.session_id} error=\"{exc}\"")
        await db.rollback()
        yield ("error", json.dumps({"code": 9001, "message": "数据库查询失败，请稍后重试"}))
        return

    # — 2. 意图分类 + Embedding —
    step = {"phase": "intent", "message": f"正在分析问题意图 (识别为: {_classify_intent(req.question)})...", "intent": _classify_intent(req.question), "elapsed_ms": 0}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    step = {"phase": "retrieval", "message": "正在将问题转换为向量表示，准备检索...", "elapsed_ms": int((time.time() - t_start) * 1000)}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    try:
        query_embedding = await embed_text(req.question, api_key=emb_cfg.api_key, base_url=emb_cfg.base_url, provider=emb_cfg.provider, model=emb_cfg.model)
    except Exception as exc:
        error_code = exc.code if isinstance(exc, AppException) else 5002
        logger.error(f"rag_embedding_failed session_id={req.session_id} error=\"{exc}\"")
        if session is None:
            await db.rollback()
            yield ("error", json.dumps({"code": error_code, "message": str(exc)}))
            return
        record = KbQaRecord(
            session_id=session.id,
            question=req.question,
            answer=f"Embedding 服务异常，请检查模型配置。错误详情：{exc}",
            ref_chunks=[],
            model_name=settings.LLM_MODEL,
            round_key=round_key,
        )
        db.add(record)
        await db.commit()
        yield ("error", json.dumps({"code": error_code, "message": str(exc)}))
        return

    # — 3. KB 智能路由 —
    resolved_kb_id, routing_event = await resolve_kb(
        db, req.question, query_embedding, req.kb_id,
        sys_cfg=sys_cfg, provider=provider, base_url=base_url,
        model=model, api_key=api_key,
    )

    # Layer 3 未命中 → 返回引导消息给前端
    if routing_event and routing_event.get("method") == "fallback":
        if routing_event.get("no_candidates"):
            # 所有 KB 都没有文档 → 提示用户上传
            fallback_msg = (
                "📄 当前没有任何知识库包含文档。"
                "请先在 知识中心 中上传文档（支持 PDF / Word / Markdown / TXT），"
                "上传完成后即可开始智能问答。"
            )
        else:
            candidates = routing_event.get("candidates", [])
            kb_names = "、".join(f"「{c['kb_name']}」" for c in candidates[:5])
            fallback_msg = (
                f"🤔 我不太确定该用哪个知识库来回答这个问题。\n\n"
                f"你可以：\n"
                + "".join(f"  • 指定 {c['kb_name']}\n" for c in candidates[:5])
                + f"  • 搜索全部知识库\n"
                f"  • 换个方式描述问题\n\n"
                f"可用知识库：{kb_names}"
            )
        await _push_thinking(req.session_id, round_key, routing_event)
        yield ("progress", json.dumps(routing_event))
        yield ("error", json.dumps({"code": 4001, "message": fallback_msg, "route_fallback": True}))
        # 如果已创建 session，确保提交
        if session is None:
            # 尚未创建 session，回滚
            return
        record = KbQaRecord(
            session_id=session.id,
            question=req.question,
            answer=fallback_msg,
            ref_chunks=[],
            model_name=settings.LLM_MODEL,
            round_key=round_key,
        )
        db.add(record)
        await db.commit()
        return

    # 路由命中 → 输出 routing thinking 事件
    if routing_event:
        await _push_thinking(req.session_id, round_key, routing_event)
        yield ("progress", json.dumps(routing_event))

    # 最终 kb_id（路由命中值 或 用户指定值 或 0=全库）
    kb_id = resolved_kb_id if resolved_kb_id is not None else 1

    # — 4. 会话管理（延后到路由完成，使用正确的 kb_id）—
    if session is None:
        session = KbSession(
            session_id=req.session_id,
            kb_id=max(kb_id, 1),  # kb_id=0（全库检索）时 session 挂在默认 KB
            title=req.question[:50] + ("..." if len(req.question) > 50 else ""),
        )
        db.add(session)
        await db.flush()
        await db.commit()

    # — 5. 检索（粗排 top_k*2，后续 Reranker 精排）—
    kb_cfg = await get_config_by_kb(db, max(kb_id, 1))
    k = kb_cfg.top_k if kb_cfg and kb_cfg.top_k is not None else 5
    threshold = kb_cfg.similarity_threshold if kb_cfg and kb_cfg.similarity_threshold is not None else 0.5
    step = {"phase": "retrieval", "message": f"正在检索本地向量数据库 (余弦相似度阈值 > {threshold:.0%})...", "elapsed_ms": int((time.time() - t_start) * 1000)}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    candidate_chunks = await retrieve_chunks(db, query_embedding, kb_id=kb_id, top_k=k * 2)

    if not candidate_chunks:
        record = KbQaRecord(
            session_id=session.id,
            question=req.question,
            answer="📄 知识库中还没有文档，我暂时无法回答你的问题。\n\n请先在左侧 知识中心 中上传文档（支持 PDF / Word / Markdown / TXT），上传完成后即可开始智能问答。",
            ref_chunks=[],
            model_name=settings.LLM_MODEL,
            round_key=round_key,
        )
        db.add(record)
        await db.commit()
        yield (
            "error",
            json.dumps({"code": 4001, "message": "未找到与问题相关的文档内容"}),
        )
        return

    # — 3.5 Reranker 精排 —
    try:
        from app.services.reranker_service import rerank
        chunk_dicts = [{"content": c.content, "chunk_id": c.chunk_id, "doc_name": c.doc_name, "similarity": float(c.similarity), "page": c.page} for c in candidate_chunks]
        ranked_dicts = await rerank(req.question, chunk_dicts, top_k=k, base_url=emb_cfg.base_url, api_key=emb_cfg.api_key)
        chunks = [
            RefChunk(
                chunk_id=d["chunk_id"],
                doc_name=d["doc_name"],
                content=d["content"],
                similarity=d.get("rerank_score", d["similarity"]),
                page=d.get("page"),
            )
            for d in ranked_dicts
        ]
        step = {"phase": "rerank", "message": f"Reranker 精排完成，选出 {len(chunks)} 个最相关片段", "elapsed_ms": int((time.time() - t_start) * 1000)}
        await _push_thinking(req.session_id, round_key, step)
        yield ("progress", json.dumps(step))
    except Exception:
        # Reranker 不可用时退化为原始排序
        chunks = candidate_chunks[:k]

    # 按文档去重汇总
    from collections import defaultdict
    doc_groups: dict[str, list] = defaultdict(list)
    for c in chunks:
        doc_groups[c.doc_name].append(c)

    doc_names = list(doc_groups.keys())
    step = {
        "phase": "matching",
        "message": f"查找到 {len(chunks)} 个相关文档分块，来自 {len(doc_names)} 份文档：",
        "elapsed_ms": int((time.time() - t_start) * 1000),
        "similarity": float(round(chunks[0].similarity, 4)),
    }
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    # 逐文档展示匹配详情
    for idx, (doc_name, doc_chunks) in enumerate(doc_groups.items(), 1):
        sorted_chunks = sorted(doc_chunks, key=lambda c: c.similarity, reverse=True)
        for ci, c in enumerate(sorted_chunks[:3]):
            page_str = f" (页码: {c.page})" if c.page else ""
            step = {
                "phase": "matching",
                "message": f" -> [{idx}.{ci+1}] {c.doc_name}{page_str}，匹配度: {c.similarity:.1%}",
                "elapsed_ms": int((time.time() - t_start) * 1000),
                "similarity": float(round(c.similarity, 4)),
            }
            await _push_thinking(req.session_id, round_key, step)
            yield ("progress", json.dumps(step))

    # — 4. LLM 生成 —
    step = {"phase": "generating", "message": f"正在调用大模型 {provider_label}: {model} 进行推理生成...", "elapsed_ms": int((time.time() - t_start) * 1000)}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    context = _build_context(chunks)
    history = await _build_history(db, session.id)
    user_prompt = f"参考文档：\n\n{context}\n{history}\n用户问题：{req.question}\n\n请回答："

    full_answer = ""
    try:
        system_prompt = sys_cfg.system_prompt.strip() if sys_cfg and sys_cfg.system_prompt else DEFAULT_SYSTEM_PROMPT
        async for token in generate_stream(system_prompt, user_prompt, provider=provider, base_url=base_url, model=model, api_key=api_key):
            full_answer += token
            yield ("token", json.dumps({"content": token}))
    except Exception as exc:
        error_code = exc.code if isinstance(exc, AppException) else 5001
        logger.error(f"rag_llm_failed session_id={req.session_id} provider={provider} model={model} error=\"{exc}\"")
        record = KbQaRecord(
            session_id=session.id,
            question=req.question,
            answer=full_answer + f"\n\n[生成中断] {exc}",
            ref_chunks=[c.model_dump() for c in chunks],
            model_name=settings.LLM_MODEL,
            round_key=round_key,
        )
        db.add(record)
        await db.commit()
        yield ("error", json.dumps({"code": error_code, "message": str(exc)}))
        return

    # — 5. 保存 QA 记录 —
    record = KbQaRecord(
        session_id=session.id,
        question=req.question,
        answer=full_answer,
        ref_chunks=[c.model_dump() for c in chunks],
        model_name=settings.LLM_MODEL,
        round_key=round_key,
    )
    db.add(record)

    # 更新会话标题（首次问答后）
    if session.title.startswith(req.question[:50]):
        session.title = req.question[:30] + ("..." if len(req.question) > 30 else "")

    await db.commit()

    elapsed_ms = int((time.time() - t_start) * 1000)
    logger.info(
        f"rag_chat_done session_id={req.session_id} answer_len={len(full_answer)} "
        f"chunks={len(chunks)} elapsed_ms={elapsed_ms}"
    )

    yield (
        "done",
        json.dumps(
            {
                "ref_chunks": [
                    {
                        "chunk_id": c.chunk_id,
                        "doc_name": c.doc_name,
                        "content": c.content,
                        "similarity": float(c.similarity),
                        "page": c.page,
                    }
                    for c in chunks
                ],
                "round_key": round_key,
                "qa_record_id": record.id,
            }
        ),
    )


# 历史查询 / 会话列表

# session CRUD 已迁移到 session_service.py
