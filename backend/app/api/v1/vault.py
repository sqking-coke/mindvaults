"""Vault 导入 API 端点。"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.api.deps import get_db
from app.config import settings
from app.schemas.vault import VaultImportRequest, VaultImportResponse
from app.schemas.common import success_response, error_response
from app.services.vault_service import import_vault, import_vault_files

router = APIRouter()

# Demo 模式：Vault 上传文件数上限
DEMO_MAX_VAULT_FILES = 20


def _demo_guard(feature: str) -> None:
    """Demo 模式下阻止危险功能。"""
    if settings.DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail=f"演示环境已禁用「{feature}」功能。请自行部署完整版体验：https://github.com/sqking-coke/mindvaults",
        )


@router.post("/vaults/import", response_model=dict)
async def import_vault_endpoint(
    payload: VaultImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """扫描本地 Obsidian Vault 目录，批量导入 .md 文件到知识库。"""
    _demo_guard("Obsidian Vault 路径扫描导入")
    try:
        result = await import_vault(db, payload.path, payload.source, payload.kb_id)
        if result["failed"] > 0 and result["imported"] == 0:
            return error_response(422, "Vault 导入全部失败，详见 errors 字段")
        return success_response(result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Vault 导入端点异常: {exc}")
        raise HTTPException(status_code=500, detail=f"Vault 导入失败: {exc}")


@router.post("/vaults/upload", response_model=dict)
async def upload_vault_endpoint(
    files: list[UploadFile] = File(...),
    source: str = Form("obsidian"),
    kb_id: int = Form(..., description="目标知识库 ID"),
    db: AsyncSession = Depends(get_db),
):
    """上传本地 Obsidian Vault 文件夹内的文件列表，批量导入到知识库。"""
    limit = DEMO_MAX_VAULT_FILES if settings.DEMO_MODE else 500
    md_files = [f for f in files if f.filename and f.filename.lower().endswith(".md")]

    if not md_files:
        return error_response(422, "未检测到任何 Markdown (.md) 文件，请确认是否拖入了正确的 Vault 目录。")

    if len(md_files) > limit:
        return error_response(
            422,
            f"演示环境单次最多导入 {limit} 个文件，当前 {len(md_files)} 个。完整版支持最多 500 个。",
        )

    try:
        result = await import_vault_files(db, md_files, source, kb_id)
        if result["failed"] > 0 and result["imported"] == 0:
            return error_response(422, "Vault 上传导入全部失败，详见 errors 字段")
        return success_response(result)
    except Exception as exc:
        logger.error(f"Vault 上传导入接口异常: {exc}")
        raise HTTPException(status_code=500, detail=f"Vault 上传并导入失败: {exc}")

