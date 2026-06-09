"""外部对话推送服务 — Skill 插件入口处理。

接收外部平台推送的 QA 对话，去重后存入 kb_external_entries，
后续复用 insight_service 的提炼管道。统一使用系统库（id=1）。
"""
import re
import secrets
import time

from loguru import logger
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.external_entry import KbExternalEntry
from app.services.monitor_service import write_event
from app.models.insight import KbInsight
from app.models.knowledge_base import KnowledgeBase
from app.models.system_config import SystemConfig

# 系统库 ID（本地 QA 和外部 Skill 统一入口）
_SYSTEM_KB_ID = 1
_API_KEY_PREFIX = "mv-dep-"
_API_KEY_BYTES = 24  # 48 hex chars + prefix = 54 chars

# 质量门阈值
_MIN_QUESTION_LENGTH = 8
# 命令/系统消息特征
_RE_COMMAND_LIKE = re.compile(
    r"^[/!]"                        # 斜杠/感叹号开头
    r"|</?command"                  # XML 命令标签 <command-args> <command-name>
    r"|^\s*$"                       # 纯空白
)
# 代码/日志特征
_RE_CODE_LIKE = re.compile(
    r"(Exception|Error|Traceback|assert|undefined|not\s+found)"
    r"|(at\s+\w+\.\w+\(|\.py:\d+|\.tsx?:\d+|\.js:\d+)"
    r'|\{\s*".*":\s*"'
    r"|git\s+(diff|log|status|commit)"
    r"|npm\s+(install|run|build)"
    r"|pip\s+install"
)


def generate_api_key() -> str:
    """生成外部推送 API Key。"""
    return _API_KEY_PREFIX + secrets.token_hex(_API_KEY_BYTES)


async def _get_external_key(db: AsyncSession) -> tuple[SystemConfig | None, str | None]:
    """读取系统配置中的 external_api_key（只读，SystemConfig 由 lifespan 保证存在）。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()

    if sys_cfg is None:
        return None, None

    return sys_cfg, sys_cfg.external_api_key


async def _get_or_create_external_key(db: AsyncSession) -> tuple[SystemConfig, str]:
    """Deprecated: use _get_external_key instead. Kept for backward compat."""
    return await _get_external_key(db)


def _validate_qa_quality(question: str, answer: str) -> tuple[bool, str]:
    """质量门：验证 QA 对是否值得入库。

    返回 (is_valid, reject_reason)。
    客户端也有对应过滤，这里是服务端兜底。
    """
    # 1. 命令/系统消息特征
    if _RE_COMMAND_LIKE.search(question):
        return False, "command_like"

    # 2. 问题过短
    if len(question) < _MIN_QUESTION_LENGTH:
        return False, "question_too_short"

    # 3. 回答过短（一句话都不到，不太可能包含有价值知识）
    if len(answer) < 20:
        return False, "answer_too_short"

    # 4. 问题看起来像代码/日志（堆栈、异常、CLI 命令等）
    if _RE_CODE_LIKE.search(question):
        return False, "code_like"

    return True, ""


async def push_external_entries(
    db: AsyncSession,
    platform: str,
    session_id: str | None,
    qa_pairs: list[dict],
    messages_json: dict | None = None,
) -> dict:
    """推送外部 QA 对话，去重后存入系统库。

    返回 {"received": N, "skipped": N, "rejected": N, "entry_ids": [...]}
    """
    t_start = time.time()
    received = 0
    skipped = 0
    rejected = 0
    reject_reasons: list[str] = []
    entry_ids: list[int] = []

    for qa in qa_pairs:
        question = (qa.get("question") or "").strip()
        answer = (qa.get("answer") or "").strip()

        if not question or not answer:
            skipped += 1
            continue

        # — 质量门（服务端兜底）—
        is_valid, reason = _validate_qa_quality(question, answer)
        if not is_valid:
            rejected += 1
            reject_reasons.append(f"q={question[:50]}|reason={reason}")
            continue

        # — 去重：同平台 + 同会话 + 同问题 —
        dup = await db.execute(
            select(KbExternalEntry.id).where(
                KbExternalEntry.kb_id == _SYSTEM_KB_ID,
                KbExternalEntry.source_platform == platform,
                KbExternalEntry.source_session == session_id,
                KbExternalEntry.question == question,
            )
        )
        if dup.scalar_one_or_none() is not None:
            skipped += 1
            continue

        entry = KbExternalEntry(
            kb_id=_SYSTEM_KB_ID,
            question=question,
            answer=answer,
            messages_json=messages_json,
            source_platform=platform,
            source_session=session_id,
            status="pending",
        )
        db.add(entry)
        await db.flush()
        entry_ids.append(entry.id)
        received += 1

    elapsed_ms = int((time.time() - t_start) * 1000)
    logger.info(
        f"external_push_done platform={platform} "
        f"received={received} skipped={skipped} rejected={rejected} elapsed_ms={elapsed_ms}"
    )
    if reject_reasons:
        logger.info(f"external_push_rejected reasons={reject_reasons}")

    await write_event(db, category="external", event="external_push_received",
        value_int=received, status="success",
        extra_json={"platform": platform, "session_id": session_id,
                    "skipped": skipped, "rejected": rejected, "elapsed_ms": elapsed_ms})

    return {
        "received": received,
        "skipped": skipped,
        "rejected": rejected,
        "entry_ids": entry_ids,
    }


async def get_external_config(
    db: AsyncSession, base_url: str = ""
) -> dict:
    """获取外部推送配置和统计（只读，SystemConfig 由 lifespan 保证存在）。"""
    sys_cfg, api_key = await _get_external_key(db)

    kb = await db.get(KnowledgeBase, _SYSTEM_KB_ID)
    kb_name = kb.name if kb else ""

    entry_count = (await db.execute(
        select(func.count(KbExternalEntry.id)).where(
            KbExternalEntry.kb_id == _SYSTEM_KB_ID
        )
    )).scalar_one()

    pending_count = (await db.execute(
        select(func.count(KbInsight.id)).where(
            KbInsight.kb_id == _SYSTEM_KB_ID,
            KbInsight.status == "pending",
        )
    )).scalar_one()

    return {
        "kb_id": _SYSTEM_KB_ID,
        "kb_name": kb_name,
        "api_key": api_key,
        "entry_count": entry_count,
        "pending_insights": pending_count,
        "endpoint": f"{base_url}/api/v1/kb/external/push" if base_url else "",
    }


async def rotate_external_key(db: AsyncSession) -> str:
    """轮换外部推送 API Key。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()

    if sys_cfg is None:
        raise AppException(code=8001, message="系统配置不存在", detail="SystemConfig not initialised", status_code=500)

    new_key = generate_api_key()
    sys_cfg.external_api_key = new_key
    await db.flush()

    logger.info("external_api_key_rotated")
    return new_key


async def _validate_external_key(db: AsyncSession, api_key: str) -> bool:
    """验证外部推送 API Key。"""
    sys_cfg = (await db.execute(
        select(SystemConfig).where(SystemConfig.id == 1)
    )).scalar_one_or_none()

    if sys_cfg is None or not sys_cfg.external_api_key:
        return False

    return secrets.compare_digest(sys_cfg.external_api_key, api_key)


async def list_external_entries(
    db: AsyncSession,
    kb_id: int = _SYSTEM_KB_ID,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询外部对话记录。"""
    base = select(KbExternalEntry).where(KbExternalEntry.kb_id == kb_id)
    count_base = select(func.count(KbExternalEntry.id)).where(KbExternalEntry.kb_id == kb_id)

    if status:
        base = base.where(KbExternalEntry.status == status)
        count_base = count_base.where(KbExternalEntry.status == status)

    total = (await db.execute(count_base)).scalar_one()

    offset = (page - 1) * page_size
    rows = (await db.execute(
        base.order_by(KbExternalEntry.created_at.desc()).offset(offset).limit(page_size)
    )).scalars().all()

    items = [
        {
            "id": e.id,
            "kb_id": e.kb_id,
            "question": e.question,
            "answer": e.answer,
            "source_platform": e.source_platform,
            "source_session": e.source_session,
            "status": e.status,
            "pushed_at": e.pushed_at.isoformat() if e.pushed_at else "",
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in rows
    ]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def skip_external_entry(db: AsyncSession, entry_id: int) -> KbExternalEntry | None:
    """将外部条目标记为 skipped（跳过不提炼）。"""
    entry = await db.get(KbExternalEntry, entry_id)
    if entry is None:
        return None
    entry.status = "skipped"
    await db.flush()
    logger.info(f"external_entry_skipped id={entry_id} platform={entry.source_platform}")
    return entry


async def delete_external_entry(db: AsyncSession, entry_id: int) -> int | None:
    """永久删除外部条目。返回 deleted_id 或 None。"""
    entry = await db.get(KbExternalEntry, entry_id)
    if entry is None:
        return None
    await db.delete(entry)
    await db.flush()
    logger.info(f"external_entry_deleted id={entry_id} platform={entry.source_platform}")
    return entry_id


async def cleanup_stale_pending_entries(db: AsyncSession, days: int = 3) -> int:
    """删除 N 天前推送但仍未提炼的 pending 条目。返回删除数量。"""
    cutoff = func.now() - text(f"INTERVAL '{days} days'")
    stmt = select(KbExternalEntry).where(
        KbExternalEntry.status == "pending",
        KbExternalEntry.pushed_at < cutoff,
    )
    entries = (await db.execute(stmt)).scalars().all()
    count = len(entries)
    for entry in entries:
        await db.delete(entry)
    await db.flush()
    if count > 0:
        logger.info(f"external_entry_cleanup_stale deleted={count} days_threshold={days}")
    return count
