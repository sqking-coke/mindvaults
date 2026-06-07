"""知识库健康诊断引擎。

多维度检测 + 报告生成 + 合并/清理操作。
"""
import re
from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from sqlalchemy import select, func, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from pgvector.sqlalchemy import Vector

from app.core.exceptions import (
    AppException,
    KbNotFoundError,
    ChunkNotFoundError,
)
from app.models import KbHealthReport
from app.models.chunk import KbChunk
from app.models.chunk_link import KbChunkLink
from app.models.document import KbDocument
from app.models.insight import KbInsight
from app.models.knowledge_base import KnowledgeBase
from app.utils.logger import log_event
from app.services.chunk_quality import compute_quality_score

# ── 阈值常量 ─────────────────────────────────────────────────

DEFAULT_DUPLICATE_THRESHOLD = 0.92      # 余弦相似度 > 此值视为重复
AUTO_MERGE_THRESHOLD = 0.98            # 自动合并阈值
RELATED_THRESHOLD_LOW = 0.85           # 相关但非重复的下界
MIN_CONTENT_LENGTH = 100               # 低质量长度阈值
OUTDATED_DAYS = 365                    # 超过此天数未命中视为过时
FRAGMENT_CLUSTER_MIN = 3               # 碎片簇最少 chunk 数
FRAGMENT_SIMILARITY_RANGE = (0.75, 0.92)  # 碎片簇相似度范围

# 健康分扣分上限
HEALTH_PENALTY_CAPS = {
    "duplicate_groups": 25,
    "low_quality": 15,
    "outdated": 10,
    "orphans": 10,
}

# 旧版本号正则
OLD_VERSION_PATTERNS = [
    re.compile(r, re.IGNORECASE)
    for r in [
        r"\bPython\s*[23]\.[0-7]\b",
        r"\bv?[0-2]\.[0-9]\.[0-9]+\b",
        r"\bDjango\s*[12]\.[0-9]+\b",
        r"\bReact\s*1[0-5]\b",
        r"\bNode\.?js\s*1[0-5]\b",
        r"\bAngular\s*[1-9]\b",
        r"\bVue\s*[12]\b",
        r"\bSpring\s*[1-4]\b",
    ]
]


# ═══════════════════════════════════════════════════════════════
# 检测器
# ═══════════════════════════════════════════════════════════════

async def detect_duplicates(
    db: AsyncSession,
    kb_id: int,
    threshold: float = DEFAULT_DUPLICATE_THRESHOLD,
    max_groups: int = 200,
) -> list[dict]:
    """近重复检测：对 kb_id 下所有 active chunk 做向量自连接。

    返回按相似度降序的重复组列表，每组包含 chunk 详情和推荐保留项。
    """
    # 子查询：该 KB 下的活跃 chunk
    active_sub = (
        select(KbChunk.id, KbChunk.embedding)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
            KbChunk.status == "active",
        )
        .subquery("active")
    )

    a = active_sub.alias("a")
    b = active_sub.alias("b")

    sim_expr = (1.0 - func.cosine_distance(a.c.embedding, b.c.embedding)).label("similarity")

    stmt = (
        select(a.c.id.label("id_a"), b.c.id.label("id_b"), sim_expr)
        .where(
            a.c.id < b.c.id,
            func.cosine_distance(a.c.embedding, b.c.embedding) < (1.0 - threshold),
        )
        .order_by(sim_expr.desc())
        .limit(max_groups)
    )

    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    # 收集涉及的 chunk ID
    chunk_ids: set[int] = set()
    for r in rows:
        chunk_ids.add(r.id_a)
        chunk_ids.add(r.id_b)

    # 批量加载 chunk 详情
    chunks_map = await _load_chunk_details(db, list(chunk_ids))

    # 构建重复组（connected components in the duplicate graph）
    groups = _build_duplicate_groups(rows, chunks_map)
    return groups


async def detect_low_quality(
    db: AsyncSession,
    kb_id: int,
    min_length: int = MIN_CONTENT_LENGTH,
) -> list[dict]:
    """低质量检测：过短、纯标点、纯代码块、已拒绝 insight 残留。"""
    # SQL 预筛选：短 chunk
    stmt = (
        select(KbChunk)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
            KbChunk.status == "active",
            func.length(KbChunk.content) < min_length,
        )
    )
    short_chunks = (await db.execute(stmt)).scalars().all()

    results: list[dict] = []
    for chunk in short_chunks:
        reason = _classify_low_quality(chunk.content)
        results.append({
            "id": chunk.id,
            "content_preview": chunk.content[:200],
            "length": len(chunk.content),
            "reason": reason,
            "doc_name": "",
            "status": chunk.status,
        })

    # 额外：已拒绝 insight 关联的 chunk（状态仍是 active 的）
    orphan_insight_stmt = (
        select(KbChunk)
        .join(KbInsight, KbChunk.source_insight_id == KbInsight.id)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbChunk.status == "active",
            KbInsight.status == "rejected",
        )
    )
    rejected_insight_chunks = (await db.execute(orphan_insight_stmt)).scalars().all()
    for chunk in rejected_insight_chunks:
        results.append({
            "id": chunk.id,
            "content_preview": chunk.content[:200],
            "length": len(chunk.content),
            "reason": "rejected_insight",
            "doc_name": "",
            "status": chunk.status,
        })

    # 填充 doc_name
    await _fill_doc_names(db, results)
    return results


async def detect_outdated(db: AsyncSession, kb_id: int) -> list[dict]:
    """过时检测：旧版本号、同一 doc_name 有新版本、时间衰减。"""
    now = datetime.now(timezone.utc)
    results: list[dict] = []

    # 加载该 KB 所有 active chunk
    stmt = (
        select(KbChunk)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
            KbChunk.status == "active",
        )
    )
    chunks = (await db.execute(stmt)).scalars().all()

    # 收集 doc_name 信息用于"同文档有新版本"检测
    doc_stmt = select(KbDocument).where(
        KbDocument.kb_id == kb_id,
        KbDocument.deleted_at.is_(None),
    )
    docs = (await db.execute(doc_stmt)).scalars().all()
    doc_name_map: dict[str, list[KbDocument]] = {}
    for d in docs:
        if d.doc_name:
            doc_name_map.setdefault(d.doc_name, []).append(d)

    for chunk in chunks:
        reason = None

        # 1. 旧版本号
        if _contains_old_version(chunk.content):
            reason = "old_version"

        # 2. 文档有新版本上传，此 chunk 属于旧文档
        doc = next((d for d in docs if d.id == chunk.document_id), None)
        if doc and doc.doc_name:
            same_name_docs = doc_name_map.get(doc.doc_name, [])
            if len(same_name_docs) > 1:
                latest_doc = max(same_name_docs, key=lambda d: d.created_at)
                if latest_doc.id != doc.id and doc.created_at < latest_doc.created_at:
                    reason = "doc_newer_version"

        # 3. 时间衰减
        chunk_age = (now - chunk.created_at.replace(tzinfo=timezone.utc)).days
        if chunk_age > OUTDATED_DAYS and (chunk.hit_count or 0) == 0:
            reason = reason or "time_decay"

        if reason:
            results.append({
                "id": chunk.id,
                "content_preview": chunk.content[:200],
                "reason": reason,
                "doc_name": doc.doc_name if doc else "",
                "created_at": chunk.created_at.isoformat() if chunk.created_at else None,
                "last_hit_at": chunk.last_hit_at.isoformat() if chunk.last_hit_at else None,
            })

    return results


async def detect_orphans(db: AsyncSession, kb_id: int) -> list[dict]:
    """孤岛检测：源文档已删除 或 insight 已被拒绝。"""
    results: list[dict] = []

    # 1. 文档已软删除
    stmt = (
        select(KbChunk)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.isnot(None),
            KbChunk.status == "active",
        )
    )
    deleted_doc_chunks = (await db.execute(stmt)).scalars().all()
    for chunk in deleted_doc_chunks:
        results.append({
            "id": chunk.id,
            "content_preview": chunk.content[:200],
            "orphan_type": "doc_deleted",
            "doc_name": "",
        })

    # 2. Insight 已拒绝
    insight_stmt = (
        select(KbChunk)
        .join(KbInsight, KbChunk.source_insight_id == KbInsight.id)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbChunk.status == "active",
            KbInsight.status == "rejected",
        )
    )
    rejected_chunks = (await db.execute(insight_stmt)).scalars().all()
    for chunk in rejected_chunks:
        results.append({
            "id": chunk.id,
            "content_preview": chunk.content[:200],
            "orphan_type": "insight_rejected",
            "doc_name": "",
        })

    return results


async def detect_fragment_clusters(
    db: AsyncSession,
    kb_id: int,
    max_chunks: int = 300,
) -> list[dict]:
    """碎片簇检测：主题相近但不重复的 chunk 聚类。

    对每个 chunk 查询 top-5 近邻（相似度 0.75-0.92），构建图后取连通分量。
    限制参与聚类的 chunk 数以控制开销。
    """
    low, high = FRAGMENT_SIMILARITY_RANGE

    # 获取该 KB 下所有 active chunk（限制数量）
    stmt = (
        select(KbChunk)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
            KbChunk.status == "active",
        )
        .limit(max_chunks)
    )
    chunks = (await db.execute(stmt)).scalars().all()
    if len(chunks) < FRAGMENT_CLUSTER_MIN:
        return []

    # 为每个 chunk 找 top-5 近邻（0.75-0.92）
    edges: set[tuple[int, int]] = set()
    chunk_ids = {c.id for c in chunks}

    for chunk in chunks:
        vec = type_coerce(chunk.embedding, Vector(1024))
        sim_expr = (1.0 - func.cosine_distance(KbChunk.embedding, vec)).label("similarity")

        neighbor_stmt = (
            select(KbChunk.id, sim_expr)
            .join(KbDocument, KbChunk.document_id == KbDocument.id)
            .where(
                KbDocument.kb_id == kb_id,
                KbDocument.deleted_at.is_(None),
                KbChunk.status == "active",
                KbChunk.id != chunk.id,
                func.cosine_distance(KbChunk.embedding, vec) < (1.0 - low),
                func.cosine_distance(KbChunk.embedding, vec) > (1.0 - high),
            )
            .order_by(func.cosine_distance(KbChunk.embedding, vec))
            .limit(5)
        )
        neighbors = (await db.execute(neighbor_stmt)).all()
        for n in neighbors:
            edge = (min(chunk.id, n.id), max(chunk.id, n.id))
            edges.add(edge)

    if not edges:
        return []

    # 连通分量
    clusters = _connected_components(edges)

    # 过滤：至少 FRAGMENT_CLUSTER_MIN 个 chunk
    clusters = [c for c in clusters if len(c) >= FRAGMENT_CLUSTER_MIN]
    if not clusters:
        return []

    # 批量加载 chunk 详情
    all_chunk_ids = set()
    for c in clusters:
        all_chunk_ids.update(c)
    chunks_map = await _load_chunk_details(db, list(all_chunk_ids))

    # 构建结果
    results: list[dict] = []
    for cluster_ids in clusters:
        cluster_chunks = [chunks_map[cid] for cid in cluster_ids if cid in chunks_map]
        if len(cluster_chunks) < FRAGMENT_CLUSTER_MIN:
            continue
        avg_sim = _avg_cluster_similarity(cluster_ids, edges)
        label = _generate_cluster_label(cluster_chunks)
        results.append({
            "cluster_label": label,
            "avg_similarity": round(avg_sim, 4),
            "chunks": cluster_chunks,
        })

    return results


# ═══════════════════════════════════════════════════════════════
# 摄入时即时检测
# ═══════════════════════════════════════════════════════════════

async def check_new_content_duplicates(
    db: AsyncSession,
    kb_id: int,
    new_chunk_ids: list[int],
    auto_merge: bool = True,
) -> dict:
    """摄入时即时检测：新 chunk vs 存量 active chunk 的重复度。

    对每个新 chunk 查询 top-3 近邻（余弦相似度 > 0.92），
    sim > 0.98 且同文档 → 自动标记 superseded（如 auto_merge=True）。

    返回摘要：{duplicates_found, auto_superseded, groups: [...]}
    """
    if not new_chunk_ids:
        return {"duplicates_found": 0, "auto_superseded": 0, "groups": []}

    new_chunks = (
        await db.execute(select(KbChunk).where(KbChunk.id.in_(new_chunk_ids)))
    ).scalars().all()

    if not new_chunks:
        return {"duplicates_found": 0, "auto_superseded": 0, "groups": []}

    groups = []
    auto_superseded = 0

    for new_chunk in new_chunks:
        vec = type_coerce(new_chunk.embedding, Vector(1024))
        sim_expr = (1.0 - func.cosine_distance(KbChunk.embedding, vec)).label("similarity")

        neighbor_stmt = (
            select(
                KbChunk.id,
                KbChunk.content,
                KbChunk.source_type,
                KbChunk.quality_score,
                KbChunk.status,
                KbChunk.document_id,
                KbDocument.doc_name,
                sim_expr,
            )
            .join(KbDocument, KbChunk.document_id == KbDocument.id)
            .where(
                KbDocument.kb_id == kb_id,
                KbDocument.deleted_at.is_(None),
                KbChunk.status == "active",
                KbChunk.id != new_chunk.id,
                func.cosine_distance(KbChunk.embedding, vec) < (1.0 - DEFAULT_DUPLICATE_THRESHOLD),
            )
            .order_by(func.cosine_distance(KbChunk.embedding, vec))
            .limit(3)
        )
        neighbors = (await db.execute(neighbor_stmt)).all()

        if not neighbors:
            continue

        new_doc = await db.get(KbDocument, new_chunk.document_id)
        new_doc_name = new_doc.doc_name if new_doc else ""

        group = {
            "new_chunk_id": new_chunk.id,
            "new_content_preview": new_chunk.content[:200],
            "new_doc_name": new_doc_name,
            "matches": [],
        }

        for n in neighbors:
            sim = float(n.similarity)
            match = {
                "existing_chunk_id": n.id,
                "existing_content_preview": n.content[:200],
                "existing_doc_name": n.doc_name or "",
                "similarity": round(sim, 4),
            }
            group["matches"].append(match)

            if auto_merge and sim > AUTO_MERGE_THRESHOLD and n.doc_name == new_doc_name:
                new_score = await compute_quality_score(db, new_chunk)
                new_chunk.quality_score = new_score

                if n.quality_score and new_score >= n.quality_score:
                    existing = await db.get(KbChunk, n.id)
                    if existing:
                        existing.status = "superseded"
                        existing.superseded_by = new_chunk.id
                        if not await _link_exists(db, kb_id, new_chunk.id, n.id, "supersedes"):
                            db.add(KbChunkLink(
                                kb_id=kb_id,
                                source_chunk_id=new_chunk.id,
                                target_chunk_id=n.id,
                                link_type="supersedes",
                            ))
                        auto_superseded += 1
                        match["auto_superseded"] = True
                else:
                    new_chunk.status = "superseded"
                    new_chunk.superseded_by = n.id
                    if not await _link_exists(db, kb_id, n.id, new_chunk.id, "supersedes"):
                        db.add(KbChunkLink(
                            kb_id=kb_id,
                            source_chunk_id=n.id,
                            target_chunk_id=new_chunk.id,
                            link_type="supersedes",
                        ))
                    auto_superseded += 1
                    match["auto_superseded"] = True
                    break

        if group["matches"]:
            groups.append(group)

    if groups:
        log_event(
            "ingestion_duplicates_detected",
            kb_id=kb_id,
            new_chunks=len(new_chunk_ids),
            groups=len(groups),
            auto_superseded=auto_superseded,
        )

    return {
        "duplicates_found": len(groups),
        "auto_superseded": auto_superseded,
        "groups": groups,
    }


# ═══════════════════════════════════════════════════════════════
# 报告生成
# ═══════════════════════════════════════════════════════════════

async def scan_health(
    db: AsyncSession,
    kb_id: int,
    scan_type: str = "manual",
) -> KbHealthReport:
    """执行全维度健康扫描并生成报告。

    Args:
        db: 数据库会话
        kb_id: 知识库 ID
        scan_type: scheduled / manual / ingestion
    """
    # 验证 KB 存在
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise KbNotFoundError(f"知识库不存在: id={kb_id}")

    log_event("health_scan_started", kb_id=kb_id, scan_type=scan_type)

    # 统计总 chunk 数
    total_chunks = await db.scalar(
        select(func.count()).select_from(KbChunk).join(
            KbDocument, KbChunk.document_id == KbDocument.id
        ).where(
            KbDocument.kb_id == kb_id,
            KbDocument.deleted_at.is_(None),
        )
    ) or 0

    # 执行各维度检测
    duplicates = await detect_duplicates(db, kb_id)
    low_quality = await detect_low_quality(db, kb_id)
    outdated = await detect_outdated(db, kb_id)
    orphans = await detect_orphans(db, kb_id)
    fragment_clusters = await detect_fragment_clusters(db, kb_id)

    # 计算健康分
    health_score, breakdown = _compute_health_score(
        total_chunks, len(duplicates), len(low_quality),
        len(outdated), len(orphans),
    )

    # 构建详情
    details = {
        "duplicates": duplicates,
        "low_quality": low_quality,
        "outdated": outdated,
        "orphans": orphans,
        "fragment_clusters": fragment_clusters,
        "health_breakdown": breakdown,
    }

    report = KbHealthReport(
        kb_id=kb_id,
        scan_type=scan_type,
        scanned_at=datetime.now(timezone.utc),
        total_chunks=total_chunks,
        duplicate_groups=len(duplicates),
        low_quality=len(low_quality),
        outdated=len(outdated),
        orphans=len(orphans),
        fragment_clusters=len(fragment_clusters),
        health_score=round(health_score, 1),
        details_json=details,
    )

    db.add(report)
    await db.flush()

    log_event(
        "health_scan_completed",
        kb_id=kb_id,
        scan_type=scan_type,
        total_chunks=total_chunks,
        duplicates=len(duplicates),
        low_quality=len(low_quality),
        outdated=len(outdated),
        orphans=len(orphans),
        fragment_clusters=len(fragment_clusters),
        health_score=f"{health_score:.1f}",
    )

    return report


# ═══════════════════════════════════════════════════════════════
# 处理操作
# ═══════════════════════════════════════════════════════════════

async def merge_chunks(
    db: AsyncSession,
    kb_id: int,
    keep_chunk_id: int,
    supersede_chunk_ids: list[int],
) -> dict:
    """合并重复 chunk：保留一个，其余标记 superseded，创建 supersedes 关联。

    返回操作摘要。
    """
    # 验证 keep chunk 存在
    keep_chunk = await db.get(KbChunk, keep_chunk_id)
    if keep_chunk is None:
        raise ChunkNotFoundError(f"切片不存在: id={keep_chunk_id}")

    # 更新质量分
    keep_score = await compute_quality_score(db, keep_chunk)
    keep_chunk.quality_score = keep_score

    superseded_count = 0
    for cid in supersede_chunk_ids:
        chunk = await db.get(KbChunk, cid)
        if chunk is None:
            continue
        chunk.status = "superseded"
        chunk.superseded_by = keep_chunk_id
        superseded_count += 1

        # 创建 supersedes 关联（避免重复：摄入自动合并可能已建）
        if not await _link_exists(db, kb_id, keep_chunk_id, cid, "supersedes"):
            db.add(KbChunkLink(
                kb_id=kb_id,
                source_chunk_id=keep_chunk_id,
                target_chunk_id=cid,
                link_type="supersedes",
            ))

    # 更新最新报告的 details_json：标记已合并组、重算健康分
    all_superseded_ids = set(supersede_chunk_ids)
    latest_report = await db.scalar(
        select(KbHealthReport)
        .where(KbHealthReport.kb_id == kb_id)
        .order_by(KbHealthReport.scanned_at.desc())
        .limit(1)
    )
    if latest_report and latest_report.details_json:
        details = latest_report.details_json
        resolved_count = 0
        for g in details.get("duplicates", []):
            chunk_ids = {c["id"] for c in g.get("chunks", [])}
            # 该组所有非 keep chunk 都在 supersede 列表中 → 已处理
            if chunk_ids - {keep_chunk_id} <= all_superseded_ids:
                g["resolved"] = True
                g["resolved_keep_id"] = keep_chunk_id
                resolved_count += 1

        if resolved_count > 0:
            latest_report.duplicate_groups = max(0, latest_report.duplicate_groups - resolved_count)
            new_score, new_breakdown = _compute_health_score(
                latest_report.total_chunks,
                latest_report.duplicate_groups,
                latest_report.low_quality,
                latest_report.outdated,
                latest_report.orphans,
            )
            latest_report.health_score = round(new_score, 1)
            details["health_breakdown"] = new_breakdown
            latest_report.details_json = details
            flag_modified(latest_report, "details_json")
            await db.flush()

    log_event(
        "health_chunk_merged",
        kb_id=kb_id,
        keep_chunk_id=keep_chunk_id,
        superseded_count=superseded_count,
    )
    return {
        "keep_chunk_id": keep_chunk_id,
        "superseded_count": superseded_count,
        "keep_quality_score": keep_score,
    }


async def link_chunks(
    db: AsyncSession,
    kb_id: int,
    source_chunk_id: int,
    target_chunk_id: int,
    link_type: str = "related",
) -> dict:
    """创建 chunk 间关联（related / cluster）。"""
    # 检查是否已存在
    existing = await db.scalar(
        select(KbChunkLink).where(
            KbChunkLink.source_chunk_id == source_chunk_id,
            KbChunkLink.target_chunk_id == target_chunk_id,
            KbChunkLink.link_type == link_type,
        )
    )
    if existing:
        return {"status": "already_exists", "link_id": existing.id}

    link = KbChunkLink(
        kb_id=kb_id,
        source_chunk_id=source_chunk_id,
        target_chunk_id=target_chunk_id,
        link_type=link_type,
    )
    db.add(link)
    await db.flush()

    log_event(
        "chunk_linked",
        kb_id=kb_id,
        source=source_chunk_id,
        target=target_chunk_id,
        link_type=link_type,
    )
    return {"status": "created", "link_id": link.id}


async def unlink_chunks(
    db: AsyncSession,
    link_id: int,
) -> dict:
    """删除 chunk 间关联。"""
    link = await db.get(KbChunkLink, link_id)
    if link is None:
        raise AppException(code=4004, message=f"关联不存在: id={link_id}", status_code=404)
    await db.delete(link)
    return {"status": "deleted", "link_id": link_id}


async def cleanup_orphans(db: AsyncSession, kb_id: int) -> dict:
    """将孤岛 chunk 标记为 orphan 状态（不物理删除）。"""
    orphans = await detect_orphans(db, kb_id)
    count = 0
    for item in orphans:
        chunk = await db.get(KbChunk, item["id"])
        if chunk:
            chunk.status = "orphan"
            count += 1

    log_event("health_orphans_cleaned", kb_id=kb_id, count=count)
    return {"orphaned_count": count}


async def archive_low_quality_chunks(
    db: AsyncSession,
    kb_id: int,
    chunk_ids: list[int],
) -> dict:
    """将低质量 chunk 归档（status → archived，不参与检索）。"""
    archived = 0
    for cid in chunk_ids:
        chunk = await db.get(KbChunk, cid)
        if chunk is None:
            continue
        chunk.status = "archived"
        archived += 1

    log_event("health_chunks_archived", kb_id=kb_id, count=archived)
    return {"archived_count": archived}


async def resolve_report(db: AsyncSession, report_id: int) -> dict:
    """标记诊断报告为已处理。"""
    report = await db.get(KbHealthReport, report_id)
    if report is None:
        raise AppException(code=4004, message=f"报告不存在: id={report_id}", status_code=404)
    report.resolved_at = datetime.now(timezone.utc)
    log_event("health_report_resolved", report_id=report_id)
    return {"status": "resolved", "report_id": report_id}


async def delete_report(db: AsyncSession, report_id: int) -> dict:
    """删除诊断报告。"""
    report = await db.get(KbHealthReport, report_id)
    if report is None:
        raise AppException(code=4004, message=f"报告不存在: id={report_id}", status_code=404)
    await db.delete(report)
    log_event("health_report_deleted", report_id=report_id)
    return {"status": "deleted", "report_id": report_id}


# ═══════════════════════════════════════════════════════════════
# 查询
# ═══════════════════════════════════════════════════════════════

async def list_reports(
    db: AsyncSession,
    kb_id: int,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """分页获取诊断报告列表。"""
    offset = (page - 1) * page_size
    total = await db.scalar(
        select(func.count()).select_from(KbHealthReport).where(
            KbHealthReport.kb_id == kb_id
        )
    ) or 0

    rows = (
        await db.execute(
            select(KbHealthReport)
            .where(KbHealthReport.kb_id == kb_id)
            .order_by(KbHealthReport.scanned_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_report(db: AsyncSession, report_id: int) -> Optional[KbHealthReport]:
    """获取单份诊断报告详情。"""
    return await db.get(KbHealthReport, report_id)


async def get_latest_report(db: AsyncSession, kb_id: int) -> Optional[KbHealthReport]:
    """获取最近一次诊断报告。"""
    return await db.scalar(
        select(KbHealthReport)
        .where(KbHealthReport.kb_id == kb_id)
        .order_by(KbHealthReport.scanned_at.desc())
        .limit(1)
    )


# ═══════════════════════════════════════════════════════════════
# 内部工具函数
# ═══════════════════════════════════════════════════════════════

async def _link_exists(
    db: AsyncSession,
    kb_id: int,
    source_chunk_id: int,
    target_chunk_id: int,
    link_type: str,
) -> bool:
    """检查 chunk link 是否已存在。"""
    existing = await db.scalar(
        select(KbChunkLink).where(
            KbChunkLink.source_chunk_id == source_chunk_id,
            KbChunkLink.target_chunk_id == target_chunk_id,
            KbChunkLink.link_type == link_type,
        )
    )
    return existing is not None


async def _load_chunk_details(
    db: AsyncSession,
    chunk_ids: list[int],
) -> dict[int, dict]:
    """批量加载 chunk 详情，含 doc_name 和 quality_score。"""
    if not chunk_ids:
        return {}

    stmt = (
        select(
            KbChunk.id,
            KbChunk.content,
            KbChunk.source_type,
            KbChunk.quality_score,
            KbChunk.status,
            KbDocument.doc_name,
        )
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(KbChunk.id.in_(chunk_ids))
    )
    rows = (await db.execute(stmt)).all()

    result = {}
    for r in rows:
        result[r.id] = {
            "id": r.id,
            "content_preview": (r.content or "")[:200],
            "source_type": r.source_type or "document",
            "quality_score": r.quality_score,
            "status": r.status or "active",
            "doc_name": r.doc_name or "",
        }
    return result


async def _fill_doc_names(db: AsyncSession, items: list[dict]) -> None:
    """为低质量/过时项批量填充 doc_name。"""
    ids = [item["id"] for item in items if not item.get("doc_name")]
    if not ids:
        return
    stmt = (
        select(KbChunk.id, KbDocument.doc_name)
        .join(KbDocument, KbChunk.document_id == KbDocument.id)
        .where(KbChunk.id.in_(ids))
    )
    rows = (await db.execute(stmt)).all()
    name_map = {r.id: r.doc_name or "" for r in rows}
    for item in items:
        if not item.get("doc_name"):
            item["doc_name"] = name_map.get(item["id"], "")


def _classify_low_quality(content: str) -> str:
    """分类低质量原因。"""
    if not content or not content.strip():
        return "empty"

    # 纯标点/数字占比
    punct_ratio = sum(1 for c in content if not c.isalpha() and c != " " and c != "\n") / max(len(content), 1)
    if punct_ratio > 0.5:
        return "punctuation"

    # 全是代码块
    stripped = content.strip()
    if stripped.startswith("```") and stripped.endswith("```") and "\n" not in stripped.strip("`"):
        return "code_only"

    return "short"


def _contains_old_version(content: str) -> bool:
    """检查内容是否包含旧版本号。"""
    for pattern in OLD_VERSION_PATTERNS:
        if pattern.search(content):
            return True
    return False


def _build_duplicate_groups(
    rows: list,
    chunks_map: dict[int, dict],
) -> list[dict]:
    """将相似对聚合成连通分量，每组附推荐保留项。"""
    # 构建邻接表
    adj: dict[int, set[int]] = {}
    sim_map: dict[tuple[int, int], float] = {}
    for r in rows:
        a_id, b_id = r.id_a, r.id_b
        adj.setdefault(a_id, set()).add(b_id)
        adj.setdefault(b_id, set()).add(a_id)
        sim_map[(min(a_id, b_id), max(a_id, b_id))] = r.similarity

    # 连通分量
    components = _connected_components_from_adj(adj)

    groups = []
    for comp_ids in components:
        if len(comp_ids) < 2:
            continue
        comp_chunks = [chunks_map[cid] for cid in comp_ids if cid in chunks_map]
        if len(comp_chunks) < 2:
            continue

        # 最大相似度
        max_sim = 0.0
        for i in range(len(comp_ids)):
            for j in range(i + 1, len(comp_ids)):
                key = (min(comp_ids[i], comp_ids[j]), max(comp_ids[i], comp_ids[j]))
                max_sim = max(max_sim, sim_map.get(key, 0.0))

        # 推荐保留：质量分最高
        scored = [c for c in comp_chunks if c["quality_score"] is not None]
        recommended = max(scored, key=lambda c: c["quality_score"]) if scored else comp_chunks[0]

        # 是否自动合并
        auto = max_sim > AUTO_MERGE_THRESHOLD and all(
            c["doc_name"] == comp_chunks[0]["doc_name"] for c in comp_chunks
        )

        groups.append({
            "similarity": round(max_sim, 4),
            "chunks": comp_chunks,
            "recommended_keep_id": recommended["id"],
            "auto_resolve": auto,
        })

    groups.sort(key=lambda g: g["similarity"], reverse=True)
    return groups


def _connected_components(edges: set[tuple[int, int]]) -> list[list[int]]:
    """从边集构建连通分量。"""
    adj: dict[int, set[int]] = {}
    for u, v in edges:
        adj.setdefault(u, set()).add(v)
        adj.setdefault(v, set()).add(u)
    return _connected_components_from_adj(adj)


def _connected_components_from_adj(adj: dict[int, set[int]]) -> list[list[int]]:
    """从邻接表构建连通分量。"""
    visited: set[int] = set()
    components: list[list[int]] = []

    def dfs(node: int, comp: list[int]) -> None:
        visited.add(node)
        comp.append(node)
        for neighbor in adj.get(node, set()):
            if neighbor not in visited:
                dfs(neighbor, comp)

    for node in adj:
        if node not in visited:
            comp: list[int] = []
            dfs(node, comp)
            if comp:
                components.append(comp)

    return components


def _avg_cluster_similarity(
    cluster_ids: list[int],
    edges: set[tuple[int, int]],
) -> float:
    """计算簇内平均边相似度。"""
    total = 0.0
    count = 0
    for i in range(len(cluster_ids)):
        for j in range(i + 1, len(cluster_ids)):
            edge = (min(cluster_ids[i], cluster_ids[j]), max(cluster_ids[i], cluster_ids[j]))
            # edges are (u, v) pairs, not (u, v, weight) — use 1.0 as placeholder
            if edge in edges:
                total += 1.0  # approximate: edge exists = ~0.83 avg similarity
                count += 1
    return total / max(count, 1)


def _generate_cluster_label(chunks: list[dict]) -> str:
    """从 chunk 内容生成簇标签。简单实现：取前两个 chunk 的常见词。"""
    # 简单实现：从第一个 chunk 的前几个词生成标签
    if not chunks:
        return "Unnamed Cluster"
    preview = chunks[0].get("content_preview", "")
    # 取前 40 字符作为标签
    label = preview[:40].strip()
    if len(label) >= 40:
        label += "..."
    return label or "Unnamed Cluster"


def _compute_health_score(
    total_chunks: int,
    duplicate_count: int,
    low_quality_count: int,
    outdated_count: int,
    orphan_count: int,
) -> tuple[float, dict]:
    """计算健康分和扣分明细。"""
    if total_chunks == 0:
        return 100.0, {"duplicates": 0, "low_quality": 0, "outdated": 0, "orphans": 0}

    penalties = {}
    # 每个重复组扣 2 分
    dup_penalty = min(duplicate_count * 2, HEALTH_PENALTY_CAPS["duplicate_groups"])
    penalties["duplicates"] = dup_penalty

    # 每个低质量扣 1 分
    lq_penalty = min(low_quality_count * 1, HEALTH_PENALTY_CAPS["low_quality"])
    penalties["low_quality"] = lq_penalty

    # 每个过时扣 0.5 分
    od_penalty = min(outdated_count * 0.5, HEALTH_PENALTY_CAPS["outdated"])
    penalties["outdated"] = od_penalty

    # 每个孤岛扣 2 分
    or_penalty = min(orphan_count * 2, HEALTH_PENALTY_CAPS["orphans"])
    penalties["orphans"] = or_penalty

    total_penalty = sum(penalties.values())
    health = max(0.0, 100.0 - total_penalty)

    # 百分比占比
    breakdown = {
        "base": 100.0,
        "duplicate_penalty": dup_penalty,
        "low_quality_penalty": lq_penalty,
        "outdated_penalty": od_penalty,
        "orphan_penalty": or_penalty,
        "total_penalty": total_penalty,
        "duplicate_groups_count": duplicate_count,
        "low_quality_count": low_quality_count,
        "outdated_count": outdated_count,
        "orphans_count": orphan_count,
        "total_chunks": total_chunks,
    }

    return health, breakdown
