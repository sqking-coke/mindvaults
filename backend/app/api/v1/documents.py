import asyncio

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.middleware import limiter
from app.schemas.common import success_response
from app.schemas.document import (
    DocumentResponse,
    DocumentUploadResponse,
    DocumentListResponse,
    DocumentUpdateRequest,
    DocumentStatusToggleRequest,
    DocumentStatusToggleResponse,
    ReindexResponse,
)
from app.services.document_service import (
    upload_documents,
    list_documents,
    get_document,
    update_document,
    hard_delete_document,
    toggle_document_status,
    reindex_document,
)

router = APIRouter(tags=["documents"])


@router.post("/documents")
@limiter.limit("10/minute")
async def upload(
    request: Request,
    files: list[UploadFile] = File(..., description="上传文件列表"),
    kb_id: int = Query(..., description="目标知识库 ID"),
    db: AsyncSession = Depends(get_db),
):
    """批量上传文档（multipart/form-data）。"""
    from app.config import settings

    # 文件数量限制
    if len(files) > settings.MAX_FILES_PER_UPLOAD:
        from app.core.exceptions import BadRequestError
        raise BadRequestError(
            f"单次最多上传 {settings.MAX_FILES_PER_UPLOAD} 个文件，当前 {len(files)} 个"
        )
    result: DocumentUploadResponse = await upload_documents(db, files, kb_id)
    return success_response(result.model_dump())


@router.get("/documents")
async def list_docs(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    kb_id: int | None = Query(None, description="按知识库过滤"),
    db: AsyncSession = Depends(get_db),
):
    """分页查询文档列表。"""
    result: DocumentListResponse = await list_documents(db, page, page_size, kb_id)
    return success_response(result.model_dump())


@router.get("/documents/watch")
async def watch_docs(
    kb_id: int = Query(..., description="知识库 ID"),
    timeout: int = Query(60, ge=5, le=300, description="长轮询超时秒数"),
    db: AsyncSession = Depends(get_db),
):
    """长轮询文档状态变更。有未完成文档时等待状态变化，无变化则超时返回。"""
    deadline = asyncio.get_event_loop().time() + timeout

    while True:
        result: DocumentListResponse = await list_documents(db, 1, 50, kb_id)
        pending = [d for d in result.items if d.status in (0, 1)]  # FAILED or PROCESSING

        if not pending:
            # 没有待处理的文档，立即返回
            return success_response(result.model_dump())

        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            # 超时，返回当前状态
            return success_response(result.model_dump())

        await asyncio.sleep(min(2.0, remaining))

@router.get("/documents/{doc_id}")
async def get_doc(doc_id: int, db: AsyncSession = Depends(get_db)):
    """获取单个文档详情。"""
    result: DocumentResponse = await get_document(db, doc_id)
    return success_response(result.model_dump())


@router.put("/documents/{doc_id}")
async def update_doc(
    doc_id: int,
    body: DocumentUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """更新文档名称或描述。"""
    result: DocumentResponse = await update_document(db, doc_id, body)
    return success_response(result.model_dump())


@router.put("/documents/{doc_id}/status")
async def toggle_doc_status(
    doc_id: int,
    body: DocumentStatusToggleRequest,
    db: AsyncSession = Depends(get_db),
):
    """切换文档禁用/启用状态。"""
    result: DocumentStatusToggleResponse = await toggle_document_status(
        db, doc_id, body.status
    )
    return success_response(result.model_dump())


@router.get("/documents/{doc_id}/content")
async def get_doc_content(doc_id: int, db: AsyncSession = Depends(get_db)):
    """返回文档原始文本内容，用于前端预览。"""
    from pathlib import Path
    import os
    result = await get_document(db, doc_id)
    file_path = Path(result.file_path)
    if not file_path.exists():
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(f"文件未找到: {result.file_path}")
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        content = file_path.read_text(errors="replace")
    return success_response({
        "doc_name": result.doc_name,
        "doc_type": result.doc_type,
        "content": content,
        "chars": len(content),
    })


@router.post("/documents/{doc_id}/reindex")
@limiter.limit("10/minute")
async def reindex_doc(
    request: Request,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
):
    """文档重索引：删除旧 chunks → 清除缓存 → 重新摄入。"""
    result: ReindexResponse = await reindex_document(db, doc_id)
    return JSONResponse(
        content=success_response(result.model_dump()),
        status_code=202,
    )


@router.delete("/documents/{doc_id}")
async def delete_doc(doc_id: int, db: AsyncSession = Depends(get_db)):
    """软删除文档。"""
    await hard_delete_document(db, doc_id)
    return success_response(None)


@router.get("/documents/{doc_id}/file")
async def get_doc_file(doc_id: int, db: AsyncSession = Depends(get_db)):
    """获取文档物理文件。"""
    import os
    result = await get_document(db, doc_id)
    if not os.path.exists(result.file_path):
        from app.core.exceptions import DocNotFoundError
        raise DocNotFoundError(f"文件未找到: {result.file_path}")
    return FileResponse(
        result.file_path,
        media_type="application/pdf" if result.doc_type == "pdf" else "application/octet-stream",
        filename=result.doc_name,
    )
