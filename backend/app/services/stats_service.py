from loguru import logger
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import KbChunk
from app.models.document import KbDocument, DOC_STATUS_PROCESSING, DOC_STATUS_COMPLETED, DOC_STATUS_DISABLED
from app.models.qa_record import KbQaRecord
from app.schemas.stats import (
    FrequentQuestionItem,
    FrequentQuestionsResponse,
    OverviewResponse,
    UnansweredItem,
    UnansweredListResponse,
)


async def get_frequent_questions(
    db: AsyncSession, top_n: int = 10
) -> FrequentQuestionsResponse:
    prefix_expr = func.substring(KbQaRecord.question, 1, 50)

    # 按 question 前缀分组聚合
    group_query = (
        select(
            prefix_expr.label("question"),
            func.count().label("count"),
            func.max(KbQaRecord.created_at).label("last_asked_at"),
        )
        .group_by(prefix_expr)
        .order_by(func.count().desc())
        .limit(top_n)
    )
    rows = (await db.execute(group_query)).all()

    items = [
        FrequentQuestionItem(
            rank=i + 1,
            question=row.question,
            count=row.count,
            last_asked_at=row.last_asked_at,
        )
        for i, row in enumerate(rows)
    ]

    # 去重前缀数
    unique_count = (
        await db.execute(
            select(func.count(func.distinct(prefix_expr)))
        )
    ).scalar_one()

    logger.info(f"高频问题统计: top_n={top_n} unique={unique_count}")
    return FrequentQuestionsResponse(
        items=items, total_unique_questions=unique_count
    )


async def get_unanswered(
    db: AsyncSession, page: int = 1, page_size: int = 20
) -> UnansweredListResponse:
    base_query = select(KbQaRecord).where(
        KbQaRecord.ref_chunks == []
    )
    count_query = (
        select(func.count())
        .select_from(KbQaRecord)
        .where(KbQaRecord.ref_chunks == [])
    )

    total = (await db.execute(count_query)).scalar_one()
    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base_query.order_by(KbQaRecord.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    items = [
        UnansweredItem(
            id=row.id,
            question=row.question,
            created_at=row.created_at,
            session_id=row.session_id,
        )
        for row in rows
    ]

    logger.info(f"无答案问题统计: total={total} page={page}")
    return UnansweredListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


async def get_kb_overview(db: AsyncSession) -> OverviewResponse:
    """知识库运维概览 — 文档/切片/QA 聚合数据。"""
    # 文档统计（排除软删除），按状态分组计数
    doc_stats_query = select(
        func.count().label("total"),
        func.sum(case((KbDocument.status == DOC_STATUS_COMPLETED, 1), else_=0)).label("active"),
        func.sum(case((KbDocument.status == DOC_STATUS_DISABLED, 1), else_=0)).label("disabled"),
        func.sum(case((KbDocument.status == DOC_STATUS_PROCESSING, 1), else_=0)).label("processing"),
        func.max(KbDocument.created_at).label("last_ingestion_at"),
    ).where(KbDocument.deleted_at.is_(None))
    doc_stats = (await db.execute(doc_stats_query)).one()

    # 切片总数
    total_chunks = (
        await db.execute(select(func.count()).select_from(KbChunk))
    ).scalar_one()

    # QA 总数 & 最近问答时间
    qa_stats_query = select(
        func.count().label("total"),
        func.max(KbQaRecord.created_at).label("last_qa_at"),
    )
    qa_stats = (await db.execute(qa_stats_query)).one()

    # 文件存储占用（直接从 file_size 列聚合）
    storage_result = await db.execute(
        select(func.coalesce(func.sum(KbDocument.file_size), 0)).where(
            KbDocument.deleted_at.is_(None)
        )
    )
    total_storage = storage_result.scalar_one()

    logger.info(
        f"知识库概览: docs={doc_stats.total} chunks={total_chunks} qa={qa_stats.total} storage={total_storage}"
    )

    return OverviewResponse(
        total_documents=doc_stats.total,
        active_documents=doc_stats.active or 0,
        disabled_documents=doc_stats.disabled or 0,
        processing_documents=doc_stats.processing or 0,
        total_chunks=total_chunks,
        total_qa_records=qa_stats.total,
        avg_similarity=0.0,
        total_storage_bytes=total_storage,
        last_ingestion_at=doc_stats.last_ingestion_at,
        last_qa_at=qa_stats.last_qa_at,
    )
