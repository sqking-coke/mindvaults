from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.middleware import limiter
from app.schemas.chat import ChatRequest
from app.schemas.common import success_response
from app.services.chat_service import chat_stream, get_chat_history, list_sessions, delete_session

router = APIRouter(tags=["chat"])


def _sse_event(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@router.post("/chat")
@limiter.limit("30/minute")
async def chat(request: Request, req: ChatRequest, db: AsyncSession = Depends(get_db)):
    """SSE 流式 RAG 问答。事件: progress / token / done / error。"""

    async def event_generator():
        async for event_type, data in chat_stream(db, req):
            yield _sse_event(event_type, data)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/chat/history")
async def chat_history(
    session_id: str = Query(..., description="会话 UUID"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
):
    """分页查询会话的问答历史。"""
    result = await get_chat_history(db, session_id, page, page_size)
    return success_response(result.model_dump())


@router.get("/chat/sessions")
async def chat_sessions(db: AsyncSession = Depends(get_db)):
    """获取所有会话列表。"""
    result = await list_sessions(db)
    return success_response(result.model_dump())


@router.delete("/chat/sessions/{session_id}")
async def chat_session_delete(session_id: str, db: AsyncSession = Depends(get_db)):
    """删除会话及其所有问答记录。"""
    await delete_session(db, session_id)
    return success_response({"deleted": session_id})


@router.get("/chat/thinking/{session_id}")
async def get_thinking(session_id: str):
    """获取指定会话的推理过程（从 Redis 读取）。"""
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        key = f"mv:thinking:{session_id}"
        items = await redis.lrange(key, 0, -1)
        import json
        steps = [json.loads(item) for item in reversed(items)]  # LPUSH 是倒序的
        return success_response({"session_id": session_id, "steps": steps})
    except Exception:
        return success_response({"session_id": session_id, "steps": []})
