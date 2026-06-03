"""会话管理服务 — 列表、分页历史、删除。"""
from loguru import logger
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import SessionNotFoundError
from app.models.qa_record import KbQaRecord
from app.models.session import KbSession
from app.schemas.chat import (
    ChatHistoryRecord,
    ChatHistoryResponse,
    SessionItem,
    SessionsListResponse,
    RefChunk,
)


async def get_chat_history(
    db: AsyncSession, session_id: str, page: int = 1, page_size: int = 20
) -> ChatHistoryResponse:
    session = (
        await db.execute(
            select(KbSession).where(KbSession.session_id == session_id)
        )
    ).scalar_one_or_none()

    if session is None:
        return ChatHistoryResponse(items=[], total=0, page=page, page_size=page_size)

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
        # 清理全量 thinking key（session 级别 + round 级别）
        cursor = 0
        pattern = f"mv:thinking:{session_id}*"
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        logger.warning(f"redis_thinking_cleanup_failed session_id={session_id}")
