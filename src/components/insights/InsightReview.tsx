"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchInsights, reviewInsight, deleteInsight, updateInsightTargetKb } from "@/services/ragService";
import { usemindvaults } from "@/context/mindvaultsContext";
import type { Insight } from "@/types/api";
import {
  CheckCircle,
  XCircle,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Loader2,
  MessageSquare,
  Globe,
} from "lucide-react";

type TabKey = "pending" | "approved" | "rejected" | "processing";
type SourceKey = "all" | "native" | "external";

const STATUS_TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "processing", label: "处理中", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  { key: "pending", label: "待审核", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "approved", label: "已通过", icon: <ThumbsUp className="h-3.5 w-3.5" /> },
  { key: "rejected", label: "已拒绝", icon: <ThumbsDown className="h-3.5 w-3.5" /> },
];

const SOURCE_TABS: { key: SourceKey; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "全部来源", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "native", label: "本地 QA", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "external", label: "外部收集", icon: <Globe className="h-3.5 w-3.5" /> },
];

// ── KB 选择器（对齐对话沙盒样式）──────────

function KbDropdown({
  kbs,
  selectedId,
  onSelect,
}: {
  kbs: { id: number; name: string }[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = kbs.find((k) => k.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 hover:text-slate-800 transition-colors"
      >
        <span className="truncate max-w-[100px]">{selected?.name || "选择知识库"}</span>
        <svg className={`h-2.5 w-2.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 8 5" fill="currentColor">
          <path d="M0 0l4 5 4-5z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-[-10px] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-[150px] z-50 max-h-[180px] overflow-y-auto">
          {kbs.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">暂无知识库</div>
          ) : (
            kbs.map((kb) => (
              <button
                key={kb.id}
                onClick={() => { onSelect(kb.id); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors truncate ${
                  selectedId === kb.id
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {kb.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════

export default function InsightReview() {
  const { knowledgeBases } = usemindvaults();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [activeSource, setActiveSource] = useState<SourceKey>("all");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Record<TabKey, number>>({ processing: 0, pending: 0, approved: 0, rejected: 0 });
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  // 每条 insight 独立的目标 KB 选择
  const [targetKbMap, setTargetKbMap] = useState<Map<number, number>>(new Map());

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const sourceParam = activeSource === "all" ? undefined : activeSource;
      const data = await fetchInsights(undefined, activeTab, 1, 50, sourceParam);
      setInsights(data.items);
      // 初始化目标 KB 映射（预填值来自 session.kb_id）
      const kbMap = new Map<number, number>();
      data.items.forEach((ins) => {
        if (ins.target_kb_id) kbMap.set(ins.id, ins.target_kb_id);
      });
      setTargetKbMap(kbMap);
      // 加载各状态计数（按来源过滤）
      const [processing, pending, approved, rejected] = await Promise.all([
        fetchInsights(undefined, "processing", 1, 1, sourceParam),
        fetchInsights(undefined, "pending", 1, 1, sourceParam),
        fetchInsights(undefined, "approved", 1, 1, sourceParam),
        fetchInsights(undefined, "rejected", 1, 1, sourceParam),
      ]);
      setCounts({
        processing: processing.total,
        pending: pending.total,
        approved: approved.total,
        rejected: rejected.total,
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeSource]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleReview = async (id: number, status: "approved" | "rejected") => {
    setReviewingId(id);
    try {
      const targetKbId = targetKbMap.get(id) ?? undefined;
      await reviewInsight(id, status, targetKbId);
      await loadInsights();
    } catch (err) {
      console.error("reviewInsight failed:", err);
    } finally {
      setReviewingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要永久删除该知识点吗？此操作不可撤销。")) return;
    setReviewingId(id);
    try {
      await deleteInsight(id);
      await loadInsights();
    } catch (err) {
      console.error("deleteInsight failed:", err);
    } finally {
      setReviewingId(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalInsights = counts.processing + counts.pending + counts.approved + counts.rejected;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">知识点总量</span>
            <span className="text-2xl font-black text-slate-800 block font-mono">{totalInsights}</span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              从对话中提炼积累
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">待审核</span>
            <span className={`text-2xl font-black block font-mono ${counts.pending > 0 ? "text-amber-600" : "text-slate-800"}`}>
              {counts.pending}
            </span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 text-amber-500 shrink-0" />
              等待人工审核确认
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">已入库</span>
            <span className="text-2xl font-black text-slate-800 block font-mono">{counts.approved}</span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <ThumbsUp className="h-3 w-3 text-green-500 shrink-0" />
              已参与 RAG 联合检索
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
            <ThumbsUp className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">已拒绝</span>
            <span className="text-2xl font-black text-slate-500 block font-mono">{counts.rejected}</span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <ThumbsDown className="h-3 w-3 text-slate-400 shrink-0" />
              未通过审核不入库
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
            <ThumbsDown className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-5 py-3 space-y-2.5">
          {/* Source filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">来源</span>
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveSource(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeSource === tab.key
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          {/* Status filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">状态</span>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`text-[10px] ${activeTab === tab.key ? "text-indigo-200" : "text-slate-400"}`}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}

            <div className="flex-1 flex items-center justify-end gap-2">
              <span className="text-[11px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
                共 {counts[activeTab]} 条
              </span>
              <button
                onClick={loadInsights}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all focus:outline-none"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
                刷新
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Insight List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      ) : insights.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 select-none">
            <div className="h-16 w-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">
              {activeTab === "processing" ? "暂无处理中的知识点" : activeTab === "pending" ? "暂无待审核知识点" : activeTab === "approved" ? "暂无已通过知识点" : "暂无已拒绝知识点"}
            </p>
            <p className="text-xs text-slate-400">
              {activeTab === "processing" ? "手动保存的知识点会在此后台提炼" : activeTab === "pending" ? "对话中的有价值内容会在每日凌晨自动提炼，也可在对话中手动保存" : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200"
            >
              <div className="p-5">
                {/* Title Row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-lg mt-0.5 shrink-0">💡</span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 text-sm leading-snug mb-1">
                        {insight.title}
                      </h3>
                      {/* Tags */}
                      {insight.tags && insight.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <Tag className="h-3 w-3 text-slate-400 shrink-0" />
                          {insight.tags.map((t, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Confidence Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round(insight.confidence * 100)}%`,
                            backgroundColor: insight.confidence >= 0.9 ? "#22c55e" : insight.confidence >= 0.7 ? "#eab308" : "#f97316",
                          }}
                        />
                      </div>
                      <span className={`text-xs font-bold font-mono w-8 text-right ${
                        insight.confidence >= 0.9 ? "text-green-600" : insight.confidence >= 0.7 ? "text-amber-600" : "text-orange-600"
                      }`}>
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                    {activeTab === "processing" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 font-medium flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> 提炼中
                      </span>
                    )}
                    {activeTab === "pending" && insight.confidence >= 0.95 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium">
                        高置信
                      </span>
                    )}
                    {activeTab !== "pending" && activeTab !== "processing" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                        activeTab === "approved"
                          ? "bg-green-50 text-green-600 border-green-200"
                          : "bg-red-50 text-red-500 border-red-200"
                      }`}>
                        {activeTab === "approved" ? "已入库" : "已拒绝"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="ml-8">
                  {insight.status === "processing" ? (
                    <p className="text-sm text-slate-400 italic flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      正在调用 LLM 提炼知识点，请稍候...
                    </p>
                  ) : (
                    <p className={`text-sm text-slate-600 leading-relaxed ${
                      expandedIds.has(insight.id) ? "" : "line-clamp-3"
                    }`}>
                      {insight.content}
                    </p>
                  )}
                  {insight.content.length > 150 && insight.status !== "processing" && (
                    <button
                      onClick={() => toggleExpand(insight.id)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 mt-1.5 flex items-center gap-1 font-medium"
                    >
                      {expandedIds.has(insight.id) ? (
                        <><ChevronUp className="h-3 w-3" /> 收起</>
                      ) : (
                        <><ChevronDown className="h-3 w-3" /> 展开全部</>
                      )}
                    </button>
                  )}
                </div>

                {/* Meta + Actions */}
                <div className="ml-8 mt-3 pt-3 border-t border-slate-100">
                  {/* Top row: info + target KB selector */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span>#{insight.id}</span>
                      {insight.source_type === "external" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200">
                          <Globe className="h-3 w-3" /> Skill 推送
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          <MessageSquare className="h-3 w-3" /> 本地 QA
                        </span>
                      )}
                      <span>{insight.created_at.slice(0, 10)}</span>
                      {insight.reviewed_at && (
                        <span>审核于 {insight.reviewed_at.slice(0, 10)}</span>
                      )}
                    </div>

                    {/* Target KB selector — 所有 tab 均可编辑 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 shrink-0">将分配到</span>
                      <KbDropdown
                        kbs={knowledgeBases.filter(kb => kb.id !== 1)}
                        selectedId={targetKbMap.get(insight.id) ?? insight.target_kb_id ?? 0}
                        onSelect={(id) => {
                          setTargetKbMap((prev) => new Map(prev).set(insight.id, id));
                          // 非 pending 状态：直接调 API 切换
                          if (activeTab !== "pending") {
                            updateInsightTargetKb(insight.id, id).then(() => loadInsights()).catch((err) => console.error("updateInsightTargetKb failed:", err));
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Bottom row: action buttons */}
                  <div className="flex items-center gap-1.5">
                    {activeTab === "processing" && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        后台处理中，完成后自动转为待审核或已入库
                      </span>
                    )}
                    {activeTab === "pending" && (
                      <>
                        <button
                          onClick={() => handleReview(insight.id, "approved")}
                          disabled={reviewingId === insight.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          通过
                        </button>
                        <button
                          onClick={() => handleReview(insight.id, "rejected")}
                          disabled={reviewingId === insight.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          拒绝
                        </button>
                      </>
                    )}
                    {activeTab !== "pending" && (
                      <span className="text-[11px] text-slate-400">
                        {activeTab === "approved" ? "✅ 已入库" : "❌ 已拒绝"}
                      </span>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => handleDelete(insight.id)}
                      disabled={reviewingId === insight.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
