"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { get, post, del } from "@/services/apiClient";
import type {
  HealthReportItem,
  HealthReportResponse,
  DuplicateGroup,
  LowQualityItem,
  OutdatedItem,
  OrphanItem,
  FragmentCluster,
} from "@/types/api";
import {
  Heart, RefreshCw, AlertTriangle, Files, Trash2, Clock,
  ChevronRight, ChevronDown, Shield, Zap, Loader2, CheckCircle2,
  TrendingUp, TrendingDown, Activity, BarChart3, X, Link2, Unlink,
} from "lucide-react";

// ── 扫描类型标签 ────────────────────────────────────────────

const SCAN_LABELS: Record<string, string> = {
  scheduled: "定时扫描",
  manual: "手动扫描",
  ingestion: "摄入触发",
};

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  duplicates: <Files className="h-4 w-4" />,
  low_quality: <AlertTriangle className="h-4 w-4" />,
  outdated: <Clock className="h-4 w-4" />,
  orphans: <Trash2 className="h-4 w-4" />,
  fragment_clusters: <BarChart3 className="h-4 w-4" />,
};

// ── 健康分颜色 ─────────────────────────────────────────────

function healthColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-red-600";
}

function healthBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 border-emerald-200";
  if (score >= 70) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function healthBarColor(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

// ── 低质量原因中文 ──────────────────────────────────────────

const LOW_QUALITY_REASONS: Record<string, string> = {
  short: "内容过短",
  empty: "空内容",
  punctuation: "纯标点/数字",
  code_only: "纯代码块",
  rejected_insight: "已拒绝 insight 残留",
};

const OUTDATED_REASONS: Record<string, string> = {
  old_version: "含旧版本号",
  doc_newer_version: "文档有新版本",
  time_decay: "长期未命中",
};

const ORPHAN_TYPES: Record<string, string> = {
  doc_deleted: "源文档已删除",
  insight_rejected: "Insight 已拒绝",
};

// ── 格式化时间 ──────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ═════════════════════════════════════════════════════════════
// 主组件
// ═════════════════════════════════════════════════════════════

export default function HealthCenter() {
  const { activeKbId, knowledgeBases, setActiveKbId, showToast } = usemindvaults();

  // Report list
  const [reports, setReports] = useState<HealthReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Latest / selected report detail
  const [selectedReport, setSelectedReport] = useState<HealthReportResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Scanning state
  const [scanning, setScanning] = useState(false);

  // Expanded sections in detail
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    duplicates: true,
    low_quality: false,
    outdated: false,
    orphans: false,
    fragment_clusters: false,
  });

  // Merge in progress
  const [merging, setMerging] = useState<Record<number, boolean>>({});

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── 加载报告列表 ───────────────────────────────────────

  const fetchReports = useCallback(async () => {
    if (!activeKbId) return;
    setReportsLoading(true);
    try {
      const data = await get<{ items: HealthReportItem[]; total: number }>(
        `/api/v1/kb/health/reports?kb_id=${activeKbId}&page=1&page_size=10`
      );
      setReports(data?.items || []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [activeKbId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ── 自动加载最新报告 ───────────────────────────────────

  useEffect(() => {
    if (!activeKbId) return;
    get<HealthReportResponse | null>(
      `/api/v1/kb/health/reports/latest?kb_id=${activeKbId}`
    )
      .then((data) => {
        if (data) setSelectedReport(data);
      })
      .catch(() => {});
  }, [activeKbId]);

  // ── 触发扫描 ───────────────────────────────────────────

  const handleScan = async () => {
    if (!activeKbId) return;
    setScanning(true);
    try {
      const data = await post<HealthReportResponse>("/api/v1/kb/health/scan", {
        kb_id: activeKbId,
        scan_type: "manual",
      });
      setSelectedReport(data);
      fetchReports();
      showToast(`扫描完成，健康度 ${data.health_score}%`);
    } catch (e: unknown) {
      showToast(`扫描失败: ${(e as Error).message}`, "error");
    } finally {
      setScanning(false);
    }
  };

  // ── 加载报告详情 ───────────────────────────────────────

  const loadReportDetail = async (reportId: number) => {
    setDetailLoading(true);
    try {
      const data = await get<HealthReportResponse | null>(
        `/api/v1/kb/health/reports/${reportId}`
      );
      if (data) setSelectedReport(data);
    } catch {
      showToast("加载报告失败", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  // ── 合并 chunk ─────────────────────────────────────────

  const handleMerge = async (groupId: number, keepId: number, supersedeIds: number[]) => {
    if (!activeKbId) return;
    setMerging((prev) => ({ ...prev, [groupId]: true }));
    try {
      await post("/api/v1/kb/health/merge", {
        kb_id: activeKbId,
        keep_chunk_id: keepId,
        supersede_chunk_ids: supersedeIds,
      });
      showToast(`已合并，保留 chunk #${keepId}`);
      // 乐观更新本地状态，不触发重新加载（避免页面滚动丢失）
      if (selectedReport) {
        const details = { ...selectedReport.details };
        const oldDups = details.duplicates;
        const newDups = oldDups.map((g, i) =>
          i === groupId ? { ...g, resolved: true, resolved_keep_id: keepId } : g
        );
        const resolvedCount = oldDups.filter((g, i) => i === groupId ? true : g.resolved).length;
        details.duplicates = newDups;
        setSelectedReport({
          ...selectedReport,
          duplicate_groups: Math.max(0, selectedReport.duplicate_groups - 1),
          health_score: Math.min(100, selectedReport.health_score + 2),
          details,
        });
      }
    } catch (e: unknown) {
      showToast(`合并失败: ${(e as Error).message}`, "error");
    } finally {
      setMerging((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  // ── 归档低质量 ───────────────────────────────────────

  const handleArchive = async (chunkIds: number[]) => {
    if (!activeKbId) return;
    try {
      await post("/api/v1/kb/health/archive", {
        kb_id: activeKbId,
        chunk_ids: chunkIds,
      });
      showToast(`已归档 ${chunkIds.length} 个低质量 chunk`);
      if (selectedReport) {
        const details = { ...selectedReport.details };
        details.low_quality = details.low_quality.filter((item) => !chunkIds.includes(item.id));
        setSelectedReport({
          ...selectedReport,
          low_quality: selectedReport.low_quality - chunkIds.length,
          health_score: Math.min(100, selectedReport.health_score + chunkIds.length),
          details,
        });
      }
    } catch (e: unknown) {
      showToast(`归档失败: ${(e as Error).message}`, "error");
    }
  };

  // ── 删除报告 ─────────────────────────────────────────

  const handleDeleteReport = async (reportId: number) => {
    try {
      await del(`/api/v1/kb/health/reports/${reportId}`);
      showToast("报告已删除");
      if (selectedReport?.id === reportId) setSelectedReport(null);
      fetchReports();
    } catch (e: unknown) {
      showToast(`删除失败: ${(e as Error).message}`, "error");
    }
  };

  // ── 标记报告已处理 ─────────────────────────────────────

  const handleResolveReport = async () => {
    if (!selectedReport) return;
    try {
      await post(`/api/v1/kb/health/reports/${selectedReport.id}/resolve`);
      showToast("报告已标记为已处理");
      fetchReports();
      setSelectedReport((prev) => prev ? { ...prev, resolved_at: new Date().toISOString() } : null);
    } catch (e: unknown) {
      showToast(`操作失败: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── KB 选择导航条 ─────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">知识库</span>
          {knowledgeBases.map((kb) => (
            <button
              key={kb.id}
              onClick={() => setActiveKbId(String(kb.id))}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeKbId === String(kb.id)
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {kb.name}
              <span className={`text-[10px] ${activeKbId === String(kb.id) ? "text-indigo-200" : "text-slate-400"}`}>
                {kb.doc_count}
              </span>
            </button>
          ))}
        </div>

      {!activeKbId ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Shield className="h-10 w-10 text-slate-200" />
          <p className="text-sm text-slate-500">请在上方选择知识库</p>
        </div>
      ) : (
      <>
      {/* ── Header Bar ──────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {selectedReport ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${healthBg(selectedReport.health_score)}`}>
              <Heart className={`h-4 w-4 ${healthColor(selectedReport.health_score)}`} />
              <span className={`text-lg font-extrabold ${healthColor(selectedReport.health_score)}`}>
                {selectedReport.health_score}%
              </span>
              <span className="text-[10px] text-slate-400">
                {selectedReport.total_chunks} chunks
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-50 border-slate-200">
              <Heart className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-400">暂无报告</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
                       bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50
                       shadow-sm transition-all"
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {scanning ? "扫描中…" : "立即分析"}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
          {/* ── 左侧：报告列表 ───────────────────────────── */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">历史报告</h3>
              <button
                onClick={fetchReports}
                className="text-[10px] text-indigo-600 hover:text-indigo-800"
              >
                刷新
              </button>
            </div>

            {reportsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">暂无报告，点击「立即分析」开始</p>
            ) : (
              <div className="space-y-1.5">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className={`group relative w-full text-left p-3 rounded-lg border transition-all text-xs cursor-pointer ${
                      selectedReport?.id === r.id
                        ? "border-indigo-300 bg-indigo-50 shadow-sm"
                        : "border-slate-100 bg-white hover:border-slate-200"
                    }`}
                  >
                    <div onClick={() => loadReportDetail(r.id)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700">
                        {SCAN_LABELS[r.scan_type] || r.scan_type}
                      </span>
                      <span className={`font-bold ${healthColor(r.health_score)}`}>
                        {r.health_score}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{fmtDate(r.scanned_at)}</span>
                      {r.resolved_at && (
                        <span className="text-emerald-500 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> 已处理
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                      {r.duplicate_groups > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          {r.duplicate_groups}组重复
                        </span>
                      )}
                      {r.low_quality > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          {r.low_quality}低质量
                        </span>
                      )}
                      {r.orphans > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {r.orphans}孤岛
                        </span>
                      )}
                    </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReport(r.id);
                      }}
                      className="absolute bottom-2 right-2 p-1 rounded-md text-slate-300 hover:text-red-500
                                 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      title="删除报告"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 右侧：报告详情 ───────────────────────────── */}
          <div className="lg:col-span-3 min-h-[400px]">
            {detailLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : !selectedReport ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Shield className="h-12 w-12 mb-3 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">选择一个报告查看详情</p>
                <p className="text-xs text-slate-400 mt-1">或点击「立即分析」生成新报告</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 健康分概览 */}
                <ReportOverview report={selectedReport} />

                {/* 各维度详情 */}
                <DimensionSection
                  key="duplicates"
                  title="疑似重复"
                  icon={DIMENSION_ICONS.duplicates}
                  count={selectedReport.details.duplicates.length}
                  expanded={expandedSections.duplicates}
                  onToggle={() => toggleSection("duplicates")}
                >
                  {selectedReport.details.duplicates.map((group, gi) => (
                    <DuplicateGroupCard
                      key={gi}
                      group={group}
                      groupIndex={gi}
                      onMerge={handleMerge}
                      merging={merging[gi]}
                    />
                  ))}
                  {selectedReport.details.duplicates.length === 0 && (
                    <EmptyDim text="未检测到重复内容" />
                  )}
                </DimensionSection>

                <DimensionSection
                  key="low_quality"
                  title="低质量"
                  icon={DIMENSION_ICONS.low_quality}
                  count={selectedReport.details.low_quality.length}
                  expanded={expandedSections.low_quality}
                  onToggle={() => toggleSection("low_quality")}
                >
                  {selectedReport.details.low_quality.length === 0 ? (
                    <EmptyDim text="未检测到低质量内容" />
                  ) : (
                    <div className="space-y-2">
                      {selectedReport.details.low_quality.map((item) => (
                        <LowQualityCard key={item.id} item={item} onArchive={() => handleArchive([item.id])} />
                      ))}
                    </div>
                  )}
                </DimensionSection>

                <DimensionSection
                  key="outdated"
                  title="可能过时"
                  icon={DIMENSION_ICONS.outdated}
                  count={selectedReport.details.outdated.length}
                  expanded={expandedSections.outdated}
                  onToggle={() => toggleSection("outdated")}
                >
                  {selectedReport.details.outdated.length === 0 ? (
                    <EmptyDim text="未检测到过时内容" />
                  ) : (
                    <div className="space-y-2">
                      {selectedReport.details.outdated.map((item) => (
                        <OutdatedCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </DimensionSection>

                <DimensionSection
                  key="orphans"
                  title="孤岛"
                  icon={DIMENSION_ICONS.orphans}
                  count={selectedReport.details.orphans.length}
                  expanded={expandedSections.orphans}
                  onToggle={() => toggleSection("orphans")}
                >
                  {selectedReport.details.orphans.length === 0 ? (
                    <EmptyDim text="未检测到孤岛内容" />
                  ) : (
                    <div className="space-y-2">
                      {selectedReport.details.orphans.map((item) => (
                        <OrphanCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </DimensionSection>

                <DimensionSection
                  key="fragment_clusters"
                  title="碎片簇"
                  icon={DIMENSION_ICONS.fragment_clusters}
                  count={selectedReport.details.fragment_clusters.length}
                  expanded={expandedSections.fragment_clusters}
                  onToggle={() => toggleSection("fragment_clusters")}
                >
                  {selectedReport.details.fragment_clusters.length === 0 ? (
                    <EmptyDim text="未检测到碎片簇" />
                  ) : (
                    <div className="space-y-3">
                      {selectedReport.details.fragment_clusters.map((cluster, ci) => (
                        <FragmentClusterCard key={ci} cluster={cluster} />
                      ))}
                    </div>
                  )}
                </DimensionSection>

                {/* 页脚操作 */}
                {!selectedReport.resolved_at && (
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleResolveReport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium
                                 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      标记已处理
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// 子组件
// ═════════════════════════════════════════════════════════════

function ReportOverview({ report }: { report: HealthReportResponse }) {
  const { health_score, total_chunks, duplicate_groups, low_quality, outdated, orphans, fragment_clusters } = report;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-4 mb-4">
        {/* 健康分圆环 */}
        <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-4 border-slate-100">
          <span className={`text-xl font-extrabold ${healthColor(health_score)}`}>
            {health_score}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">知识库健康度</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {total_chunks} chunks · {fmtDate(report.scanned_at)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {health_score >= 80 ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className="text-[11px] text-slate-400">
            {SCAN_LABELS[report.scan_type] || report.scan_type}
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4">
        <div
          className={`h-full rounded-full transition-all ${healthBarColor(health_score)}`}
          style={{ width: `${health_score}%` }}
        />
      </div>

      {/* 维度速览标签 */}
      <div className="flex flex-wrap gap-2">
        <DimensionTag label="重复组" count={duplicate_groups} color="amber" />
        <DimensionTag label="低质量" count={low_quality} color="red" />
        <DimensionTag label="过时" count={outdated} color="slate" />
        <DimensionTag label="孤岛" count={orphans} color="slate" />
        <DimensionTag label="碎片簇" count={fragment_clusters} color="blue" />
      </div>
    </div>
  );
}

function DimensionTag({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${colors[color] || colors.slate}`}>
      {label}: {count}
    </span>
  );
}

function DimensionSection({
  title, icon, count, expanded, onToggle, children,
}: {
  title: string; icon: React.ReactNode; count: number;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          {count > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              count > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
            }`}>
              {count}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-50 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function EmptyDim({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      {text}
    </div>
  );
}

function DuplicateGroupCard({
  group, groupIndex, onMerge, merging,
}: {
  group: DuplicateGroup; groupIndex: number;
  onMerge: (gi: number, keepId: number, supersedeIds: number[]) => void;
  merging: boolean;
}) {
  const resolved = group.resolved === true;
  const keepId = resolved ? (group.resolved_keep_id || group.recommended_keep_id) : group.recommended_keep_id;
  const [selectedKeep, setSelectedKeep] = useState<number | null>(keepId);
  const effectiveKeepId = resolved ? keepId! : (selectedKeep || group.recommended_keep_id || group.chunks[0]?.id);
  const supersedeIds = group.chunks.filter((c) => c.id !== effectiveKeepId).map((c) => c.id);

  return (
    <div className={`p-3 rounded-lg border mb-2 last:mb-0 ${
      resolved ? "border-emerald-200 bg-emerald-50/40" :
      group.auto_resolve ? "border-emerald-200 bg-emerald-50/50" :
      "border-slate-200 bg-slate-50"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500">组 {groupIndex + 1}</span>
          <span className="text-[10px] text-amber-600 font-semibold">
            相似度 {(group.similarity * 100).toFixed(1)}%
          </span>
          {resolved ? (
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">
              ✅ 已合并
            </span>
          ) : group.auto_resolve && (
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">
              ⚡ 可自动合并
            </span>
          )}
        </div>
        {!resolved && supersedeIds.length > 0 && (
          <button
            onClick={() => onMerge(groupIndex, effectiveKeepId, supersedeIds)}
            disabled={merging}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold
                       bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {merging ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Link2 className="h-3 w-3" />
            )}
            合并
          </button>
        )}
      </div>

      {group.chunks.map((chunk) => {
        const isSuperseded = resolved && chunk.id !== effectiveKeepId;
        return (
        <div
          key={chunk.id}
          onClick={() => !resolved && setSelectedKeep(chunk.id)}
          className={`flex items-start gap-2 p-2 rounded-md text-[11px] transition-all mb-1 last:mb-0 ${
            resolved ? "cursor-default" : "cursor-pointer"
          } ${
            chunk.id === effectiveKeepId
              ? "bg-indigo-100 border border-indigo-200 ring-1 ring-indigo-300"
              : isSuperseded
                ? "bg-slate-100 border border-slate-100 text-slate-400 line-through"
                : "bg-white border border-slate-100 hover:border-slate-200"
          }`}
        >
          <div className="mt-0.5">
            {chunk.id === effectiveKeepId ? (
              <div className="h-3.5 w-3.5 rounded-full bg-indigo-500 flex items-center justify-center">
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              </div>
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-slate-700">chunk #{chunk.id}</span>
              <span className="text-[10px] text-slate-400">{chunk.doc_name}</span>
              {chunk.quality_score !== null && (
                <span className="text-[10px] text-indigo-500 font-medium">
                  Q{chunk.quality_score.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-slate-500 leading-relaxed line-clamp-2">{chunk.content_preview}</p>
          </div>
        </div>
      );
      })}

      {!resolved && (
        <p className="text-[10px] text-slate-400 mt-2">
          推荐保留 chunk #{group.recommended_keep_id}（点击可切换）
        </p>
      )}
    </div>
  );
}

function LowQualityCard({ item, onArchive }: { item: LowQualityItem; onArchive: () => void }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 bg-white text-[11px] group">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-slate-700">chunk #{item.id}</span>
          <span className="text-[10px] text-slate-400">{item.doc_name}</span>
          <span className="text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-medium">
            {LOW_QUALITY_REASONS[item.reason] || item.reason}
          </span>
          <span className="text-[10px] text-slate-400">{item.length} 字符</span>
        </div>
        <p className="text-slate-500 leading-relaxed line-clamp-2">{item.content_preview}</p>
      </div>
      <button
        onClick={onArchive}
        className="shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold
                   text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200
                   opacity-0 group-hover:opacity-100 transition-all"
        title="归档此 chunk"
      >
        归档
      </button>
    </div>
  );
}

function OutdatedCard({ item }: { item: OutdatedItem }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 bg-white text-[11px]">
      <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-slate-700">chunk #{item.id}</span>
          <span className="text-[10px] text-slate-400">{item.doc_name}</span>
          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
            {OUTDATED_REASONS[item.reason] || item.reason}
          </span>
        </div>
        <p className="text-slate-500 leading-relaxed line-clamp-2">{item.content_preview}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
          {item.created_at && <span>创建: {fmtDate(item.created_at)}</span>}
          {item.last_hit_at && <span>最后命中: {fmtDate(item.last_hit_at)}</span>}
        </div>
      </div>
    </div>
  );
}

function OrphanCard({ item }: { item: OrphanItem }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 bg-white text-[11px]">
      <Trash2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-slate-700">chunk #{item.id}</span>
          <span className="text-[10px] text-slate-400">{item.doc_name}</span>
          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
            {ORPHAN_TYPES[item.orphan_type] || item.orphan_type}
          </span>
        </div>
        <p className="text-slate-500 leading-relaxed line-clamp-2">{item.content_preview}</p>
      </div>
    </div>
  );
}

function FragmentClusterCard({ cluster }: { cluster: FragmentCluster }) {
  return (
    <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-semibold text-slate-700 line-clamp-1">{cluster.cluster_label}</span>
        <span className="text-[10px] text-slate-400">
          {cluster.chunks.length} chunks · 平均相似度 {(cluster.avg_similarity * 100).toFixed(0)}%
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {cluster.chunks.map((chunk) => (
          <div key={chunk.id} className="flex items-center gap-1.5 p-1.5 rounded bg-white border border-slate-100 text-[10px]">
            <span className="font-semibold text-slate-600 shrink-0">#{chunk.id}</span>
            <span className="text-slate-400 truncate">{chunk.doc_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
