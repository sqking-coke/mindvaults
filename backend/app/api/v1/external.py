"""外部对话推送 API — Skill 插件入口。

认证方式：Authorization: Bearer <external_api_key>
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import ExternalAuthError
from app.schemas.common import success_response
from app.schemas.external import (
    ExternalPushRequest,
    ExternalPushResponse,
    DepositionConfigResponse,
    KeyRotateResponse,
    ExternalEntryListResponse,
)
from app.services.external_push_service import (
    push_external_entries,
    get_external_config,
    rotate_external_key,
    _validate_external_key,
    list_external_entries,
    skip_external_entry,
    delete_external_entry,
)

# Public: push endpoint（KB 级 API Key 鉴权，无需全局 API Key）
external_push_router = APIRouter(tags=["external"])
# Authenticated: 配置/轮换端点（需要全局 API Key）
deposition_config_router = APIRouter(tags=["deposition"])


def _extract_bearer_token(request: Request) -> str | None:
    """从 Authorization header 提取 Bearer token。"""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


# ── 推送端点 ──────────────────────────────────────────────────

@external_push_router.post("/external/push")
async def external_push(
    request: Request,
    req: ExternalPushRequest,
    db: AsyncSession = Depends(get_db),
):
    """Skill 插件推送对话的唯一入口。

    Header: Authorization: Bearer <external_api_key>
    """
    api_key = _extract_bearer_token(request)
    if not api_key:
        raise ExternalAuthError(
            message="API Key 缺失", detail="Missing API Key in Authorization header", status_code=401
        )

    if not await _validate_external_key(db, api_key):
        raise ExternalAuthError(
            message="API Key 无效", detail="Invalid API Key", status_code=403
        )

    qa_dicts = [{"question": q.question, "answer": q.answer} for q in req.qa_pairs]
    result = await push_external_entries(
        db,
        platform=req.platform,
        session_id=req.session_id,
        qa_pairs=qa_dicts,
        messages_json=req.messages_json,
    )
    await db.commit()

    return success_response(ExternalPushResponse(**result).model_dump())


# ── 配置端点（前端设置页用）────────────────────────────────────

@deposition_config_router.get("/deposition/config")
async def deposition_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """获取外部推送配置和统计。"""
    base_url = str(request.base_url).rstrip("/")
    config = await get_external_config(db, base_url=base_url)

    return success_response(DepositionConfigResponse(**config).model_dump())


@deposition_config_router.post("/deposition/key/rotate")
async def deposition_key_rotate(db: AsyncSession = Depends(get_db)):
    """轮换外部推送 API Key。旧 Key 立即失效。"""
    new_key = await rotate_external_key(db)
    await db.commit()

    return success_response(KeyRotateResponse(api_key=new_key).model_dump())


@deposition_config_router.get("/external/entries")
async def list_external_entries_route(
    kb_id: int = 1,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """分页查询外部 Skill 推送的对话记录。"""
    result = await list_external_entries(db, kb_id=kb_id, status=status, page=page, page_size=page_size)
    await db.commit()

    return success_response(ExternalEntryListResponse(**result).model_dump())


@deposition_config_router.post("/external/entries/{entry_id}/skip")
async def skip_external_entry_route(entry_id: int, db: AsyncSession = Depends(get_db)):
    """将外部条目标记为跳过（不再提炼）。"""
    entry = await skip_external_entry(db, entry_id)
    if entry is None:
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(message="外部条目不存在", detail=f"entry_id={entry_id}")
    await db.commit()
    return success_response({"id": entry_id, "status": entry.status})


@deposition_config_router.delete("/external/entries/{entry_id}")
async def delete_external_entry_route(entry_id: int, db: AsyncSession = Depends(get_db)):
    """永久删除外部条目。"""
    deleted_id = await delete_external_entry(db, entry_id)
    if deleted_id is None:
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(message="外部条目不存在", detail=f"entry_id={entry_id}")
    await db.commit()
    return success_response({"deleted": entry_id})
