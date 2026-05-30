"""Vault 导入 API 端点。"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.api.deps import get_db
from app.schemas.vault import VaultImportRequest, VaultImportResponse
from app.schemas.common import success_response, error_response
from app.services.vault_service import import_vault, import_vault_files

router = APIRouter()


@router.post("/vaults/import", response_model=dict)
async def import_vault_endpoint(
    payload: VaultImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """扫描本地 Obsidian Vault 目录，批量导入 .md 文件到知识库。

    处理流程：
    1. 递归扫描目录下所有 .md 文件
    2. 解析 YAML frontmatter（title / tags / date / aliases）
    3. 将 [[wikilink]] 转换为纯文本
    4. 写入暂存区并创建文档记录
    5. 调度后台摄入管道进行切片/向量化
    """
    try:
        result = await import_vault(db, payload.path, payload.source)
        # 如果有失败项且导入了 0 条，返回 422
        if result["failed"] > 0 and result["imported"] == 0:
            return error_response(422, "Vault 导入全部失败，详见 errors 字段")
        return success_response(result)
    except Exception as exc:
        logger.error(f"Vault 导入端点异常: {exc}")
        raise HTTPException(status_code=500, detail=f"Vault 导入失败: {exc}")


@router.post("/vaults/upload", response_model=dict)
async def upload_vault_endpoint(
    files: list[UploadFile] = File(...),
    source: str = Form("obsidian"),
    db: AsyncSession = Depends(get_db),
):
    """上传本地 Obsidian Vault 文件夹内的文件列表，批量导入到知识库。

    处理流程：
    1. 过滤并只接收 .md 后缀的文本文件
    2. 逐个文件解析 YAML Frontmatter 并进行 WikiLinks 转换为纯文本
    3. 将处理后的文本写入暂存区，并记录文档路径和状态
    4. 自动调度后台切片及向量计算管道
    """
    try:
        # 仅处理包含 .md 的文件（支持部分相对路径情况如 `MyVault/Note.md` 或直接文件名）
        md_files = [f for f in files if f.filename and f.filename.lower().endswith(".md")]
        
        if not md_files:
            return error_response(422, "未检测到任何 Markdown (.md) 文件，请确认是否拖入了正确的 Vault 目录。")
        
        result = await import_vault_files(db, md_files, source)
        
        # 如果全部失败，返回 422
        if result["failed"] > 0 and result["imported"] == 0:
            return error_response(422, "Vault 上传导入全部失败，详见 errors 字段")
            
        return success_response(result)
    except Exception as exc:
        logger.error(f"Vault 上传导入接口异常: {exc}")
        raise HTTPException(status_code=500, detail=f"Vault 上传并导入失败: {exc}")

