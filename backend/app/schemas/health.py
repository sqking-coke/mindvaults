"""健康诊断相关 Pydantic Schemas。

用于 API 返回的知识库健康报告、重复组、低质量项等结构化数据。
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── 重复组 ───────────────────────────────────────────────

class DuplicateChunkItem(BaseModel):
    """重复组中的一个 chunk。"""
    id: int
    content_preview: str = Field(default="", description="前 200 字符")
    doc_name: str = ""
    source_type: str = "document"
    quality_score: Optional[float] = None
    status: str = "active"


class DuplicateGroup(BaseModel):
    """一组近重复 chunk。"""
    similarity: float = Field(description="最高相似度")
    chunks: list[DuplicateChunkItem]
    recommended_keep_id: Optional[int] = Field(default=None, description="推荐保留的 chunk ID")
    auto_resolve: bool = Field(default=False, description="sim > 0.98 且同文档可自动合并")
    resolved: bool = Field(default=False, description="用户已合并处理")
    resolved_keep_id: Optional[int] = Field(default=None, description="合并时保留的 chunk ID")


# ── 低质量 ───────────────────────────────────────────────

class LowQualityItem(BaseModel):
    """低质量 chunk。"""
    id: int
    content_preview: str = ""
    length: int
    reason: str = ""  # short / punctuation / code_only / rejected_insight
    doc_name: str = ""
    status: str = "active"


# ── 过时 ────────────────────────────────────────────────

class OutdatedItem(BaseModel):
    """可能过时的 chunk。"""
    id: int
    content_preview: str = ""
    reason: str = ""  # old_version / doc_newer_version / time_decay
    doc_name: str = ""
    created_at: Optional[datetime] = None
    last_hit_at: Optional[datetime] = None


# ── 孤岛 ─────────────────────────────────────────────────

class OrphanItem(BaseModel):
    """孤岛 chunk（源已删除但 chunk 残存）。"""
    id: int
    content_preview: str = ""
    orphan_type: str = ""  # doc_deleted / insight_rejected
    doc_name: str = ""


# ── 碎片簇 ───────────────────────────────────────────────

class FragmentCluster(BaseModel):
    """主题相近的碎片簇。"""
    cluster_label: str = ""  # "Django ORM 性能优化" 等主题标签
    avg_similarity: float = 0.0
    chunks: list[DuplicateChunkItem]


# ── 诊断报告详情 ─────────────────────────────────────────

class HealthReportDetail(BaseModel):
    """details_json 结构。"""
    duplicates: list[DuplicateGroup] = Field(default_factory=list)
    low_quality: list[LowQualityItem] = Field(default_factory=list)
    outdated: list[OutdatedItem] = Field(default_factory=list)
    orphans: list[OrphanItem] = Field(default_factory=list)
    fragment_clusters: list[FragmentCluster] = Field(default_factory=list)
    health_breakdown: dict = Field(default_factory=dict, description="健康分扣分明细")


class HealthReportItem(BaseModel):
    """报告列表项。"""
    id: int
    kb_id: int
    scan_type: str
    scanned_at: datetime
    total_chunks: int
    duplicate_groups: int
    low_quality: int
    outdated: int
    orphans: int
    fragment_clusters: int
    health_score: float
    resolved_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthReportResponse(BaseModel):
    """报告详情（含 details_json）。"""
    id: int
    kb_id: int
    scan_type: str
    scanned_at: datetime
    total_chunks: int
    duplicate_groups: int
    low_quality: int
    outdated: int
    orphans: int
    fragment_clusters: int
    health_score: float
    details: HealthReportDetail
    resolved_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 处理操作 ─────────────────────────────────────────────

class MergeRequest(BaseModel):
    """合并请求：保留一个 chunk，其余标记 superseded。"""
    keep_chunk_id: int = Field(description="保留的 chunk ID")
    supersede_chunk_ids: list[int] = Field(description="要标记为 superseded 的 chunk ID 列表")


class LinkRequest(BaseModel):
    """创建 chunk 间关联。"""
    source_chunk_id: int
    target_chunk_id: int
    link_type: str = "related"  # related / cluster


class ResolveReportRequest(BaseModel):
    """标记报告已处理。"""
    pass
