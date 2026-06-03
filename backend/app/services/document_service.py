import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from loguru import logger
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    DocNotFoundError,
    DocFormatUnsupportedError,
    DocSizeExceededError,
    DocStatusInvalidError,
)
from app.models.document import (
    KbDocument,
    DOC_STATUS_PROCESSING,
    DOC_STATUS_COMPLETED,
    DOC_STATUS_DISABLED,
)
from app.schemas.document import (
    DocumentResponse,
    DocumentListItem,
    DocumentUploadResponse,
    DocumentListResponse,
    DocumentUpdateRequest,
    DocumentStatusToggleRequest,
    DocumentStatusToggleResponse,
    ReindexResponse,
)
from app.services.ingestion_service import schedule_ingestion
from app.utils.logger import log_event
from app.services.cache_service import CacheService
from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis
from app.models.chunk import KbChunk


def _validate_file(file: UploadFile) -> str:
    """校验单个文件的扩展名和大小。返回小写扩展名。"""
    if not file.filename:
        raise DocFormatUnsupportedError("文件名为空")

    ext = Path(file.filename).suffix.lstrip(".").lower()
    if ext not in settings.allowed_extensions_list:
        raise DocFormatUnsupportedError(
            f"不支持的文件格式 .{ext}，允许: {settings.ALLOWED_EXTENSIONS}"
        )
    return ext


def _validate_file_size(file: UploadFile) -> None:
    """校验单个文件大小（需先 read 才能获取 size，调用方负责 seek）。"""
    if file.size is not None and file.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise DocSizeExceededError(
            f"文件大小 {file.size / 1024 / 1024:.1f}MB 超出限制 {settings.MAX_UPLOAD_SIZE_MB}MB"
        )


async def upload_documents(
    db: AsyncSession, files: list[UploadFile], kb_id: int
) -> DocumentUploadResponse:
    """批量上传文档到指定知识库：校验 → 落盘 → 建记录。"""
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    documents: list[DocumentListItem] = []
    ingestion_queue: list[tuple[int, str, str]] = []  # (doc_id, ext, file_path)

    for file in files:
        ext = _validate_file(file)
        _validate_file_size(file)

        stored_name = f"{uuid.uuid4().hex}.{ext}"
        dest_path = upload_dir / stored_name

        try:
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as exc:
            logger.error(f"file_write_failed path=\"{dest_path}\" error=\"{exc}\"")
            if dest_path.exists():
                dest_path.unlink()
            raise

        doc = KbDocument(
            kb_id=kb_id,
            doc_name=file.filename or stored_name,
            doc_type=ext,
            file_path=str(dest_path),
            status=DOC_STATUS_PROCESSING,
            chunk_count=0,
            file_size=dest_path.stat().st_size,
        )
        db.add(doc)
        await db.flush()

        documents.append(
            DocumentListItem(
                id=doc.id,
                doc_name=doc.doc_name,
                status=doc.status,
                chunk_count=doc.chunk_count,
                kb_id=doc.kb_id,
            )
        )

        ingestion_queue.append((doc.id, ext, str(dest_path)))

        log_event("doc_uploaded", doc_id=doc.id, kb_id=kb_id, file=doc.doc_name)

    await db.commit()

    # commit 之后再调度摄入（避免新 session 查不到未提交的文档）
    for doc_id, ext, path in ingestion_queue:
        schedule_ingestion(AsyncSessionLocal, doc_id, ext, path)

    return DocumentUploadResponse(documents=documents, total=len(documents))


async def list_documents(
    db: AsyncSession, page: int = 1, page_size: int = 20, kb_id: int | None = None
) -> DocumentListResponse:
    """分页查询文档列表（可按 KB 过滤）。"""
    from app.models.chunk import KbChunk

    base_query = (
        select(
            KbDocument,
            func.coalesce(func.sum(func.length(KbChunk.content)), 0).label("char_count"),
        )
        .outerjoin(KbChunk, KbChunk.document_id == KbDocument.id)
        .group_by(KbDocument.id)
    )
    if kb_id is not None:
        base_query = base_query.where(KbDocument.kb_id == kb_id)

    count_query = select(func.count()).select_from(KbDocument)
    if kb_id is not None:
        count_query = count_query.where(KbDocument.kb_id == kb_id)

    total = (await db.execute(count_query)).scalar_one()
    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base_query.order_by(KbDocument.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    items = []
    for doc, char_count in rows:
        item = DocumentResponse.model_validate(doc)
        item.char_count = char_count
        logger.debug(
            f"list_documents doc_id={doc.id} kb_id={kb_id} "
            f"chunk_count={doc.chunk_count} char_count={char_count}"
        )
        items.append(item)
    logger.debug(f"list_documents total={total} kb_id={kb_id} rows={len(items)}")
    return DocumentListResponse(items=items, total=total, page=page, page_size=page_size)


async def get_document(db: AsyncSession, doc_id: int) -> DocumentResponse:
    """获取单文档详情（排除已软删除）。"""
    row = (
        await db.execute(
            select(KbDocument).where(
                KbDocument.id == doc_id
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise DocNotFoundError(f"文档不存在: id={doc_id}")
    return DocumentResponse.model_validate(row)


async def update_document(
    db: AsyncSession, doc_id: int, data: DocumentUpdateRequest
) -> DocumentResponse:
    """更新文档名称/描述。"""
    row = (
        await db.execute(
            select(KbDocument).where(
                KbDocument.id == doc_id
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise DocNotFoundError(f"文档不存在: id={doc_id}")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(row, key, value)

    await db.commit()
    await db.refresh(row)
    return DocumentResponse.model_validate(row)


async def hard_delete_document(db: AsyncSession, doc_id: int) -> None:
    """硬删除文档及其所有切片（物理删除，不可恢复）。"""
    from pathlib import Path
    from sqlalchemy import delete
    from app.models.chunk import KbChunk

    row = (await db.execute(select(KbDocument).where(KbDocument.id == doc_id))).scalar_one_or_none()
    if row is None:
        raise DocNotFoundError(f"文档不存在: id={doc_id}")

    file_path = row.file_path
    doc_name = row.doc_name
    kb_id = row.kb_id

    # 先删切片，再删文档（chunk FK 有 CASCADE，但显式执行更清晰）
    await db.execute(delete(KbChunk).where(KbChunk.document_id == doc_id))
    await db.delete(row)
    await db.commit()

    # 清理磁盘文件
    try:
        p = Path(file_path)
        if p.exists():
            p.unlink()
    except Exception:
        pass

    # 更新 KB 质心向量（文档数减少）
    try:
        from app.services.retrieval_service import update_centroid
        await update_centroid(db, kb_id)
    except Exception:
        pass

    log_event("doc_deleted", doc_id=doc_id, file=doc_name)


_STATUS_LABEL_MAP = {
    DOC_STATUS_DISABLED: "disabled",
    DOC_STATUS_COMPLETED: "enabled",
}


async def toggle_document_status(
    db: AsyncSession, doc_id: int, target_status: str
) -> DocumentStatusToggleResponse:
    """切换文档禁用/启用状态。"""
    if target_status not in ("disabled", "enabled"):
        raise DocStatusInvalidError(f"无效的状态值: {target_status}")

    row = (
        await db.execute(
            select(KbDocument).where(
                KbDocument.id == doc_id
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise DocNotFoundError(f"文档不存在: id={doc_id}")

    if target_status == "disabled":
        row.status = DOC_STATUS_DISABLED
    else:
        row.status = DOC_STATUS_COMPLETED

    await db.commit()
    await db.refresh(row)

    label = _STATUS_LABEL_MAP.get(row.status, "unknown")
    log_event("doc_status_changed", doc_id=doc_id, status=label)

    return DocumentStatusToggleResponse(
        id=row.id,
        kb_id=row.kb_id,
        doc_name=row.doc_name,
        status=row.status,
        chunk_count=row.chunk_count,
        status_label=label,
        updated_at=row.updated_at,
    )


async def reindex_document(db: AsyncSession, doc_id: int) -> ReindexResponse:
    """文档重索引：删除旧 chunks → 清除缓存 → 重新摄入管道。"""
    row = (
        await db.execute(
            select(KbDocument).where(
                KbDocument.id == doc_id
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise DocNotFoundError(f"文档不存在: id={doc_id}")

    # 删除旧 chunks
    await db.execute(delete(KbChunk).where(KbChunk.document_id == doc_id))

    # 清除 Redis 检索缓存
    try:
        redis = await get_redis()
        cache = CacheService(redis)
        await cache.invalidate()
    except Exception as exc:
        logger.warning(f"redis_cache_invalidation_failed error=\"{exc}\"")

    # 重置文档状态并调度后台摄入
    row.status = DOC_STATUS_PROCESSING
    row.chunk_count = 0

    schedule_ingestion(AsyncSessionLocal, row.id, row.doc_type, row.file_path)

    await db.commit()
    await db.refresh(row)

    log_event("doc_reindex_submitted", doc_id=doc_id, file=row.doc_name)

    return ReindexResponse(
        doc_id=row.id,
        doc_name=row.doc_name,
        status=row.status,
        message="重索引已提交，后台处理中",
    )
