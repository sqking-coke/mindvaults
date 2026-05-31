import asyncio

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_PROCESSING, DOC_STATUS_COMPLETED, DOC_STATUS_FAILED
from app.models.config import KbConfig
from app.utils.logger import log_event
from app.services.parser_service import parse_document
from app.services.chunking_service import chunk_pages
from app.services.embedding_service import embed_text


async def ingest_document(db: AsyncSession, doc_id: int, doc_type: str, file_path: str) -> None:
    """文档摄入管道：解析 → 切片 → 向量化 → 入库。"""
    try:
        # 0. 标记为处理中
        doc = (
            await db.execute(select(KbDocument).where(KbDocument.id == doc_id))
        ).scalar_one_or_none()
        if doc is None:
            log_event("doc_not_found", doc_id=doc_id)
            return
        doc.status = DOC_STATUS_PROCESSING
        await db.flush()

        # 1. 解析文档，返回 [(text, page_number), ...]
        pages = await parse_document(file_path, doc_type)
        if not pages:
            log_event("doc_parsing_empty", doc_id=doc_id, path=file_path)
            doc.status = DOC_STATUS_FAILED
            await db.commit()
            return

        # 2. 读取配置（从文档所属 KB）
        config = await _get_or_create_config(db, doc.kb_id)
        # 3. 逐页切片，保留页码信息
        chunks_with_pages = await chunk_pages(
            pages,
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
            mode="semantic",
        )
        if not chunks_with_pages:
            log_event("doc_chunking_empty", doc_id=doc_id)
            doc.status = DOC_STATUS_FAILED
            await db.commit()
            return

        # 4. 向量化 + 入库（逐条处理，避免内存溢出）
        for idx, (chunk_content, page_num) in enumerate(chunks_with_pages):
            try:
                embedding = await embed_text(chunk_content)
            except Exception as exc:
                logger.error(f"embedding_failed doc_id={doc_id} chunk={idx} error=\"{exc}\"")
                continue

            chunk_record = KbChunk(
                document_id=doc_id,
                chunk_index=idx,
                content=chunk_content,
                embedding=embedding,
                page=page_num,
            )
            db.add(chunk_record)

        await db.flush()

        # 5. 更新文档状态：完成
        doc.chunk_count = len(chunks_with_pages)
        doc.status = DOC_STATUS_COMPLETED
        await db.commit()
        log_event("doc_ingestion_completed", doc_id=doc_id, type=doc_type, chunks=len(chunks_with_pages))

    except Exception as exc:
        logger.error(f"doc_ingestion_failed doc_id={doc_id} error=\"{exc}\"")
        await db.rollback()
        # 尝试将文档标记为失败（需要新事务）
        try:
            doc = (
                await db.execute(select(KbDocument).where(KbDocument.id == doc_id))
            ).scalar_one_or_none()
            if doc:
                doc.status = DOC_STATUS_FAILED
                await db.commit()
        except Exception as inner_exc:
            logger.error(f"doc_status_update_failed doc_id={doc_id} error=\"{inner_exc}\"")


def schedule_ingestion(
    db_factory, doc_id: int, doc_type: str, file_path: str
) -> None:
    """在后台异步调度文档摄入，不阻塞上传响应。"""
    async def _run():
        async with db_factory() as session:
            await ingest_document(session, doc_id, doc_type, file_path)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run())
    except RuntimeError:
        logger.warning("ingestion_skipped_no_event_loop")


async def _get_or_create_config(db: AsyncSession, kb_id: int) -> KbConfig:
    row = (
        await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))
    ).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
    return row
