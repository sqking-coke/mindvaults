import asyncio
import time
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_PROCESSING, DOC_STATUS_COMPLETED, DOC_STATUS_FAILED
from app.models.config import KbConfig
from app.utils.logger import log_event
from app.services.parser_service import parse_document
from app.services.chunking_service import chunk_pages
from app.config import settings
from app.services.embedding_service import embed_batch


async def ingest_document(
    db: AsyncSession, doc_id: int, doc_type: str, file_path: str,
    llm_api_key: str | None = None, embedding_api_key: str | None = None,
) -> None:
    """文档摄入管道：解析 → 切片 → 向量化 → 入库。

    可选传入 llm_api_key / embedding_api_key，优先级高于配置。
    """
    try:
        # 0. 标记为处理中
        doc = (
            await db.execute(select(KbDocument).where(KbDocument.id == doc_id))
        ).scalar_one_or_none()
        if doc is None:
            log_event("doc_not_found", doc_id=doc_id)
            # 尝试从独立会话补救：可能刚提交但尚未可见
            await db.rollback()
            await asyncio.sleep(1.0)
            doc2 = (await db.execute(select(KbDocument).where(KbDocument.id == doc_id))).scalar_one_or_none()
            if doc2 is None:
                logger.error(f"doc_not_found_after_retry doc_id={doc_id}")
                return
            doc = doc2
        doc.status = DOC_STATUS_PROCESSING
        doc.status_detail = {"phase": "parsing", "started_at": datetime.now(timezone.utc).isoformat()}
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
            doc.status_detail = {"phase": "failed", "error": "chunking produced no chunks", "at": datetime.now(timezone.utc).isoformat()}
            await db.commit()
            return

        # 4. 批量向量化 + 入库
        doc.status_detail = {"phase": "embedding", "total": len(chunks_with_pages), "started_at": datetime.now(timezone.utc).isoformat()}
        await db.flush()

        chunk_texts = [c[0] for c in chunks_with_pages]

        # 解析 embedding 配置：传参 > SystemConfig > env
        from app.models.system_config import SystemConfig
        from app.services.embedding_service import resolve_embedding_config

        sys_cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
        emb_cfg = await resolve_embedding_config(sys_cfg, api_key_override=embedding_api_key)

        try:
            embeddings = await embed_batch(
                chunk_texts,
                api_key=emb_cfg.api_key,
                base_url=emb_cfg.base_url,
                provider=emb_cfg.provider,
            )
        except Exception as exc:
            logger.error(f"embedding_batch_failed doc_id={doc_id} chunks={len(chunk_texts)} error=\"{exc}\"")
            doc.status = DOC_STATUS_FAILED
            doc.status_detail = {"phase": "failed", "error": str(exc)[:500], "at": datetime.now(timezone.utc).isoformat()}
            await db.commit()
            return

        for idx, (chunk_content, page_num) in enumerate(chunks_with_pages):
            chunk_record = KbChunk(
                document_id=doc_id,
                chunk_index=idx,
                content=chunk_content,
                embedding=embeddings[idx],
                page=page_num,
            )
            db.add(chunk_record)

        await db.flush()

        # 5. 从数据库统计实际切片数，更新文档状态为完成
        actual_count = (await db.execute(
            select(func.count()).select_from(KbChunk).where(KbChunk.document_id == doc_id)
        )).scalar_one()
        logger.info(
            f"ingestion_chunk_count doc_id={doc_id} memory={len(chunks_with_pages)} db={actual_count}"
        )
        if actual_count == 0:
            logger.error(
                f"ingestion_chunk_count_zero doc_id={doc_id} memory={len(chunks_with_pages)} "
                f"this means flush didn't persist chunks — will retry on next reindex"
            )
        doc.chunk_count = actual_count
        doc.status = DOC_STATUS_COMPLETED
        doc.status_detail = {"phase": "done", "chunks": actual_count, "finished_at": datetime.now(timezone.utc).isoformat()}
        await db.commit()
        log_event("doc_ingestion_completed", doc_id=doc_id, type=doc_type, chunks=actual_count)

        # 异步更新质心向量（KB 智能路由 Layer 1 依赖）
        try:
            from app.services.retrieval_service import update_centroid
            await update_centroid(db, doc.kb_id)
        except Exception:
            logger.warning(f"centroid_update_after_ingestion_failed kb_id={doc.kb_id}")

    except Exception as exc:
        logger.error(f"doc_ingestion_failed doc_id={doc_id} error=\"{exc}\"")
        await db.rollback()
        raise  # 向上抛出，由 schedule_ingestion 的重试逻辑处理


# 并发控制：最多 3 个文档同时摄入，防止撑爆 DB 连接池 (pool_size=10)
_ingestion_semaphore = asyncio.Semaphore(3)

# 任务注册表：doc_id → asyncio.Task，支持去重/取消/可观测
_task_registry: dict[int, asyncio.Task] = {}

# 重试配置
_MAX_RETRIES = 3
_RETRY_DELAYS = [2, 5, 15]  # 指数退避


def get_pending_count() -> int:
    """返回当前正在摄入的文档数。"""
    return len(_task_registry)


def schedule_ingestion(
    db_factory, doc_id: int, doc_type: str, file_path: str
) -> None:
    """在后台异步调度文档摄入，不阻塞上传响应。Semaphore 控制并发数为 3。
    同一文档不重复调度。失败自动重试 3 次（指数退避）。"""
    if doc_id in _task_registry and not _task_registry[doc_id].done():
        logger.warning(f"ingestion_already_scheduled doc_id={doc_id}")
        return

    async def _run_with_retry():
        last_error = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with _ingestion_semaphore:
                    async with db_factory() as session:
                        await ingest_document(session, doc_id, doc_type, file_path)
                logger.info(f"ingestion_completed doc_id={doc_id} attempt={attempt + 1}")
                return  # 成功，退出
            except asyncio.CancelledError:
                logger.warning(f"ingestion_cancelled doc_id={doc_id}")
                raise  # 不重试取消
            except Exception as exc:
                last_error = exc
                if attempt < _MAX_RETRIES - 1:
                    delay = _RETRY_DELAYS[attempt]
                    logger.warning(f"ingestion_retry doc_id={doc_id} attempt={attempt + 1}/{_MAX_RETRIES} delay={delay}s error=\"{exc}\"")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"ingestion_all_retries_exhausted doc_id={doc_id} error=\"{exc}\"")

        # 所有重试耗尽 → 标记 FAILED
        try:
            async with db_factory() as session:
                doc = await session.get(KbDocument, doc_id)
                if doc and doc.status == DOC_STATUS_PROCESSING:
                    doc.status = DOC_STATUS_FAILED
                    doc.status_detail = {
                        "phase": "failed",
                        "error": str(last_error)[:500] if last_error else "unknown",
                        "retries": _MAX_RETRIES,
                        "at": datetime.now(timezone.utc).isoformat(),
                    }
                    await session.commit()
                    logger.info(f"doc_marked_failed_after_retries doc_id={doc_id}")
        except Exception as mark_exc:
            logger.error(f"doc_mark_failed_error doc_id={doc_id} error=\"{mark_exc}\"")

    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(_run_with_retry())
        _task_registry[doc_id] = task
        task.add_done_callback(lambda t: _task_registry.pop(doc_id, None))
        logger.info(f"ingestion_scheduled doc_id={doc_id} active={len(_task_registry)}")
    except RuntimeError:
        logger.warning("ingestion_skipped_no_event_loop")


async def recover_stuck_documents(db_factory) -> int:
    """服务启动时扫描状态为 PROCESSING 的文档，重新调度摄入。返回恢复数量。"""
    from app.models.document import DOC_STATUS_PROCESSING
    async with db_factory() as session:
        result = await session.execute(
            select(KbDocument).where(KbDocument.status == DOC_STATUS_PROCESSING)
        )
        stuck = result.scalars().all()

    for doc in stuck:
        if doc.file_path:
            schedule_ingestion(db_factory, doc.id, doc.doc_type, doc.file_path)
        else:
            logger.warning(f"recover_skipped_no_path doc_id={doc.id}")

    if stuck:
        logger.info(f"recovered_stuck_documents count={len(stuck)}")
    return len(stuck)


async def _get_or_create_config(db: AsyncSession, kb_id: int) -> KbConfig:
    row = (
        await db.execute(select(KbConfig).where(KbConfig.kb_id == kb_id))
    ).scalar_one_or_none()
    if row is None:
        row = KbConfig(kb_id=kb_id)
        db.add(row)
        await db.flush()
    return row
