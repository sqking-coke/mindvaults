import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator

from loguru import logger
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import SessionNotFoundError
from app.models.qa_record import KbQaRecord
from app.models.session import KbSession
from app.schemas.chat import (
    ChatRequest,
    ChatHistoryRecord,
    ChatHistoryResponse,
    SessionItem,
    SessionsListResponse,
    RefChunk,
)
from app.services.embedding_service import embed_text
from app.services.retrieval_service import retrieve_chunks
from app.services.llm_service import generate_stream


MAX_HISTORY_TURNS = 5

INTENT_PATTERNS = [
    (["什么是", "如何", "怎么", "为什么", "原理", "架构", "设计", "区别", "配置"], "knowledge_qa"),
    (["查找", "搜索", "列出", "有哪些", "找一下"], "document_lookup"),
    (["你好", "谢谢", "再见", "帮助", "你是谁"], "chitchat"),
]

RAG_SYSTEM_PROMPT = (
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


async def _push_thinking(session_id: str, round_key: str, step: dict) -> None:
    """将推理步骤写入 Redis LIST，按轮次隔离（非阻塞，Redis 不可用时静默跳过）。"""
    try:
        from app.core.redis import get_redis
        from app.config import settings
        redis = await get_redis()
        key = f"mv:thinking:{session_id}:{round_key}"
        await asyncio.wait_for(redis.lpush(key, json.dumps(step)), timeout=2.0)
        await asyncio.wait_for(redis.expire(key, settings.THINKING_TTL_SECONDS), timeout=2.0)
    except Exception:
        logger.warning(f"redis_push_thinking_failed session_id={session_id} round_key={round_key} phase={step.get('phase')}")


async def chat_stream(
    db: AsyncSession, req: ChatRequest
) -> AsyncGenerator[tuple[str, str], None]:
    """RAG 流式问答主流程，yield (event_type, json_data) 元组。"""
    t_start = time.time()
    round_key = uuid.uuid4().hex[:8]  # 本轮唯一标识，隔离 Redis 推理步骤

    # 先发送 start 事件，让客户端立即知道流已建立，防止阻塞操作导致前端一直"等待中"
    yield ("start", json.dumps({"status": "processing"}))

    # — 0. 提前获取配置 —
    from app.services.retrieval_service import get_config
    cfg = await get_config(db)
    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER
    model = cfg.llm_model if cfg.llm_model is not None else settings.LLM_MODEL
    threshold = cfg.similarity_threshold if cfg.similarity_threshold is not None else 0.5
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

    # 确定 kb_id：请求 > 会话 > 默认 1
    kb_id = req.kb_id or (session.kb_id if session else 1)

    if session is None:
        session = KbSession(
            session_id=req.session_id,
            kb_id=kb_id,
            title=req.question[:50] + ("..." if len(req.question) > 50 else ""),
        )
        db.add(session)
        await db.flush()
        await db.commit()  # 立即提交会话创建，释放锁，后续 LLM 失败不影响会话存在

    step = {"phase": "intent", "message": f"正在分析问题意图 (识别为: {_classify_intent(req.question)})...", "intent": _classify_intent(req.question), "elapsed_ms": 0}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    # — 2. Embedding —
    step = {"phase": "retrieval", "message": "正在将问题转换为向量表示，准备检索...", "elapsed_ms": int((time.time() - t_start) * 1000)}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    try:
        query_embedding = await embed_text(req.question)
    except Exception as exc:
        logger.error(f"rag_embedding_failed session_id={req.session_id} error=\"{exc}\"")
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
        yield ("error", json.dumps({"code": 5002, "message": str(exc)}))
        return

    # — 3. 检索 —
    step = {"phase": "retrieval", "message": f"正在检索本地向量数据库 (余弦相似度阈值 > {threshold:.0%})...", "elapsed_ms": int((time.time() - t_start) * 1000)}
    await _push_thinking(req.session_id, round_key, step)
    yield ("progress", json.dumps(step))

    chunks = await retrieve_chunks(db, query_embedding, kb_id=kb_id)

    if not chunks:
        # 落库：即使未检索到文档，也保存问答记录，确保对话历史完整
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
        "similarity": round(chunks[0].similarity, 4),
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
                "similarity": round(c.similarity, 4),
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
        async for token in generate_stream(RAG_SYSTEM_PROMPT, user_prompt):
            full_answer += token
            yield ("token", json.dumps({"content": token}))
    except Exception as exc:
        logger.error(f"rag_llm_failed session_id={req.session_id} provider={provider} model={model} error=\"{exc}\"")
        # 落库：保存已生成的部分内容 + 错误信息
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
        yield ("error", json.dumps({"code": 5001, "message": str(exc)}))
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
                        "similarity": c.similarity,
                        "page": c.page,
                    }
                    for c in chunks
                ],
                "round_key": round_key,
            }
        ),
    )


# 历史查询 / 会话列表

async def get_chat_history(
    db: AsyncSession, session_id: str, page: int = 1, page_size: int = 20
) -> ChatHistoryResponse:
    session = (
        await db.execute(
            select(KbSession).where(KbSession.session_id == session_id)
        )
    ).scalar_one_or_none()

    if session is None:
        raise SessionNotFoundError(f"会话不存在: {session_id}")

    count_q = (
        select(func.count())
        .select_from(KbQaRecord)
        .where(KbQaRecord.session_id == session.id)
    )
    total = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            select(KbQaRecord)
            .where(KbQaRecord.session_id == session.id)
            .order_by(KbQaRecord.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    items = [
        ChatHistoryRecord(
            id=row.id,
            question=row.question,
            answer=row.answer,
            ref_chunks=[RefChunk(**c) for c in (row.ref_chunks or [])],
            model_name=row.model_name,
            round_key=row.round_key,
            created_at=row.created_at,
        )
        for row in rows
    ]

    return ChatHistoryResponse(
        items=items, total=total, page=page, page_size=page_size
    )


async def list_sessions(db: AsyncSession) -> SessionsListResponse:
    rows = (
        await db.execute(
            select(KbSession).order_by(KbSession.updated_at.desc())
        )
    ).scalars().all()

    logger.debug(f"sessions_listed total={len(rows)}")

    return SessionsListResponse(
        sessions=[
            SessionItem(
                id=row.id,
                session_id=row.session_id,
                title=row.title,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]
    )


async def delete_session(db: AsyncSession, session_id: str) -> None:
    """删除会话及其所有问答记录，同时清理 Redis 推理缓存。"""
    from sqlalchemy import delete

    session = (
        await db.execute(
            select(KbSession).where(KbSession.session_id == session_id)
        )
    ).scalar_one_or_none()

    if session is None:
        raise SessionNotFoundError(f"会话不存在: {session_id}")

    await db.execute(
        delete(KbQaRecord).where(KbQaRecord.session_id == session.id)
    )
    # 先记数据，再删
    qa_count = (
        await db.execute(
            select(func.count()).select_from(KbQaRecord).where(KbQaRecord.session_id == session.id)
        )
    ).scalar_one()
    session_title = session.title

    await db.execute(
        delete(KbQaRecord).where(KbQaRecord.session_id == session.id)
    )
    await db.delete(session)
    await db.commit()

    logger.info(
        f"session_deleted session_id={session_id} title=\"{session_title}\" qa_records={qa_count}"
    )

    # 清理 Redis 推理缓存
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        await redis.delete(f"mv:thinking:{session_id}")
    except Exception:
        logger.warning(f"redis_thinking_cleanup_failed session_id={session_id}")
