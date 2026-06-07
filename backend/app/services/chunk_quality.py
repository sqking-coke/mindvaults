"""Chunk 质量评分与源头过滤服务。

提供：
- compute_quality_score — 多维度评分（事后）
- update_hit_count — 检索命中统计
- filter_chunks — 摄入前质量过滤（源头治理）
"""
import re

from loguru import logger

# ── 源头过滤规则 ──────────────────────────────────────────────

# 制表符/box-drawing 字符（U+2500–U+257F 区间）+ 常见 ASCII 艺术符号
BOX_DRAWING_CHARS = re.compile(
    r"[─-╿"  # Unicode Box Drawing 区块
    r"│├─└┌┤┬┴┼"  # 常见单线
    r"├│└┌┤┬┴┼─═╚║╗╝╣╩╦╠╬▼▶]"  # 额外明确列举
)

# 纯符号占比阈值
MAX_SYMBOL_RATIO = 0.6

# 纯标题行检测
HEADING_ONLY = re.compile(r"^#{1,6}\s+\S.*$", re.MULTILINE)

# 内容中英文/数字占比下限
MIN_ALNUM_RATIO = 0.3

# 内容长度下限（字符）
MIN_CONTENT_LENGTH = 50


def _box_drawing_ratio(text: str) -> float:
    """制表符/ASCII 艺术字符占比。"""
    if not text:
        return 0.0
    return len(BOX_DRAWING_CHARS.findall(text)) / len(text)


def _alnum_ratio(text: str) -> float:
    """中英文/数字字符占比。"""
    if not text:
        return 0.0
    alnum = sum(1 for c in text if c.isalnum() or "一" <= c <= "鿿")
    return alnum / len(text)


def _is_heading_only(text: str) -> bool:
    """是否为纯标题（如 ### 4.5 核心代码结构），不含正文。"""
    stripped = text.strip()
    lines = stripped.split("\n")
    # 只有非空行 ≤ 2 且至少一行是 markdown 标题
    non_empty = [l for l in lines if l.strip()]
    if len(non_empty) > 2:
        return False
    return any(HEADING_ONLY.match(l) for l in non_empty)


def filter_chunks(
    chunks: list[tuple[str, int | None]],
    min_length: int = MIN_CONTENT_LENGTH,
    max_box_ratio: float = 0.3,
    max_symbol_ratio: float = MAX_SYMBOL_RATIO,
) -> tuple[list[tuple[str, int | None]], list[dict]]:
    """摄入前质量过滤：剔除明显不可用的切片。

    返回 (保留的切片列表, 被剔除的原因列表)。
    """
    kept: list[tuple[str, int | None]] = []
    rejected: list[dict] = []

    for text, page_num in chunks:
        reason = None
        length = len(text)

        # 1. 过短
        if length < min_length:
            reason = f"too_short len={length}"

        # 2. 制表符/ASCII 艺术占比过高
        elif _box_drawing_ratio(text) > max_box_ratio:
            reason = f"box_drawing_ratio={_box_drawing_ratio(text):.2f}"

        # 3. 纯标题
        elif _is_heading_only(text):
            reason = "heading_only"

        # 4. 字母/数字/中文占比过低
        elif _alnum_ratio(text) < MIN_ALNUM_RATIO:
            reason = f"alnum_ratio={_alnum_ratio(text):.2f}"

        if reason:
            rejected.append({
                "page": page_num,
                "preview": text[:100],
                "length": length,
                "reason": reason,
            })
        else:
            kept.append((text, page_num))

    if rejected:
        logger.info(
            f"chunk_quality_filter total={len(chunks)} kept={len(kept)} "
            f"rejected={len(rejected)} min_len={min_length}"
        )

    return kept, rejected
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import KbChunk
from app.models.concept import KbChunkConcept
from app.utils.logger import log_event

# ── 来源权威权重 ──────────────────────────────────────────────

SOURCE_WEIGHT = {
    "insight_confirmed": 1.0,
    "document": 0.7,
    "insight_auto": 0.4,
}


async def _get_concept_count(db: AsyncSession, chunk_id: int) -> int:
    """查询 chunk 关联的概念数量。"""
    count = await db.scalar(
        select(func.count()).select_from(KbChunkConcept).where(
            KbChunkConcept.chunk_id == chunk_id
        )
    )
    return count or 0


async def compute_quality_score(db: AsyncSession, chunk: KbChunk) -> float:
    """计算 chunk 质量分，0-1。

    五维度加权评分：
    1. 内容长度 (0-0.25)
    2. 引用热度 (0-0.30)
    3. 概念关联数 (0-0.20)
    4. 时效性 (0-0.15)
    5. 来源权威性 (0-0.10)
    """
    score = 0.0

    # 1. 内容长度 (0-0.25)
    score += min(len(chunk.content) / 1000, 1.0) * 0.25

    # 2. 引用热度 (0-0.30)
    hit_count = chunk.hit_count or 0
    score += min(hit_count / 20, 1.0) * 0.30

    # 3. 概念关联数 (0-0.20)
    concept_count = await _get_concept_count(db, chunk.id)
    score += min(concept_count / 5, 1.0) * 0.20

    # 4. 时效性 (0-0.15)
    age_days = (datetime.now(timezone.utc) - chunk.created_at.replace(tzinfo=timezone.utc)).days
    score += max(0, 1.0 - age_days / 365) * 0.15

    # 5. 来源权威性 (0-0.10)
    score += SOURCE_WEIGHT.get(chunk.source_type, 0.5) * 0.10

    return round(score, 4)


async def update_hit_count(db: AsyncSession, chunk_id: int) -> None:
    """检索命中时递增 hit_count 并更新 last_hit_at。

    调用方需自行 commit。
    """
    chunk = await db.get(KbChunk, chunk_id)
    if chunk is None:
        return
    chunk.hit_count = (chunk.hit_count or 0) + 1
    chunk.last_hit_at = datetime.now(timezone.utc)


async def batch_update_quality_scores(
    db: AsyncSession,
    chunk_ids: list[int],
    commit: bool = False,
) -> dict[int, float]:
    """批量计算并持久化 chunk 质量分。

    返回 {chunk_id: score} 映射。调用方负责 commit（或设 commit=True）。
    """
    if not chunk_ids:
        return {}

    chunks = (
        await db.execute(select(KbChunk).where(KbChunk.id.in_(chunk_ids)))
    ).scalars().all()

    results: dict[int, float] = {}
    for chunk in chunks:
        score = await compute_quality_score(db, chunk)
        chunk.quality_score = score
        results[chunk.id] = score

    if commit:
        await db.commit()

    log_event(
        "quality_scores_updated",
        count=len(results),
        avg_score=f"{sum(results.values()) / len(results):.3f}" if results else "0",
    )
    return results
