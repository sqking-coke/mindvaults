"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { fetchDocuments, fetchOverviewStats, type OverviewStats } from "@/services/ragService";
import type { DocumentRecord } from "@/types/api";
import { formatDateTimeFull } from "@/utils/date";
import {
  Sliders,
  FileText,
  Layers,
  EyeOff,
  RefreshCw,
  Database,
  Calendar,
  Activity,
  HardDrive,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  AlertCircle,
  XCircle,
} from "lucide-react";
import DocumentTable from "./DocumentTable";

const PAGE_SIZE = 20;

export default function KBOpsPanel() {
  const { knowledgeBases, documents: ctxDocs } = usemindvaults();

  // -- filters & pagination --
  const [search, setSearch] = useState("");
  const [kbFilter, setKbFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all"); // "all" | "success" | "parsing" | "failed" | "disabled"
  const [page, setPage] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [opsDocs, setOpsDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // -- stats --
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // -- debounced search --
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // -- 过滤逻辑（fetch 和 watch 共用） --
  const applyFilters = useCallback(
    (docs: DocumentRecord[], totalFromApi: number) => {
      let filtered = docs;
      if (statusFilter !== "all") filtered = filtered.filter((d) => d.status === statusFilter);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((d) => d.name.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q));
      }
      setOpsDocs(filtered);
      setTotalDocs(search ? filtered.length : totalFromApi);
    },
    [search, statusFilter],
  );

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const kbId = kbFilter === "all" ? undefined : Number(kbFilter);
      const result = await fetchDocuments(page, PAGE_SIZE, kbId);
      applyFilters(result.docs, result.total);
    } catch {
      setOpsDocs([]);
      setTotalDocs(0);
    } finally {
      setLoading(false);
    }
  }, [page, kbFilter, applyFilters]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // -- stats --
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await fetchOverviewStats();
      setStats(data);
    } catch {
      const totalDocs = ctxDocs.length;
      const disabledDocs = ctxDocs.filter((d) => d.status === "disabled").length;
      const processingDocs = ctxDocs.filter((d) => d.status === "parsing").length;
      const activeDocs = totalDocs - disabledDocs - processingDocs;
      setStats({
        total_documents: totalDocs,
        active_documents: activeDocs,
        disabled_documents: disabledDocs,
        processing_documents: processingDocs,
        total_chunks: ctxDocs.reduce((s, d) => s + (d.chunkCount || 0), 0),
        total_qa_records: 0,
        avg_similarity: 0,
        total_storage_bytes: 0,
        last_ingestion_at: null,
        last_qa_at: null,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [ctxDocs]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const totalPages = Math.max(1, Math.ceil(totalDocs / PAGE_SIZE));

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 select-none">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sliders className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">知识库运维管理</h1>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            对所有知识库的文档进行深度维护，支持按库筛选、关键字搜索、分页浏览、启用/禁用、重索引等操作。
          </p>
        </div>

        <button
          onClick={() => { loadDocs(); loadStats(); }}
          disabled={loading}
          className="mt-4 md:mt-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all focus:outline-none"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
          刷新看板
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">物理文档总量</span>
            <span className="text-2xl font-black text-slate-800 block font-mono">
              {stats ? stats.total_documents : "—"}
            </span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <Activity className="h-3 w-3 text-indigo-500 shrink-0" />
              其中 {stats ? stats.active_documents : "0"} 个在线召回
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">向量切片总量</span>
            <span className="text-2xl font-black text-slate-800 block font-mono">
              {stats ? stats.total_chunks.toLocaleString() : "—"}
            </span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <Database className="h-3 w-3 text-violet-500 shrink-0" />
              对齐 pgvector 索引树
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">人工禁用数量</span>
            <span className="text-2xl font-black text-slate-500 block font-mono">
              {stats ? stats.disabled_documents : "—"}
            </span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <EyeOff className="h-3 w-3 text-slate-400 shrink-0" />
              已隔离不参与对话
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
            <EyeOff className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">正在重索引/解析</span>
            <span className={`text-2xl font-black block font-mono ${stats && stats.processing_documents > 0 ? "text-amber-600 animate-pulse" : "text-slate-800"}`}>
              {stats ? stats.processing_documents : "—"}
            </span>
            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 truncate">
              <HardDrive className="h-3 w-3 text-amber-500 shrink-0" />
              存储占用 {stats ? formatBytes(stats.total_storage_bytes) : "—"}
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 mr-2 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <RefreshCw className={`h-5 w-5 ${stats && stats.processing_documents > 0 ? "animate-spin" : ""}`} />
          </div>
        </div>
      </div>

      {/* Log dates bar */}
      {stats && (stats.last_ingestion_at || stats.last_qa_at) && (
        <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-wrap gap-4 items-center text-[11px] text-slate-500 select-none">
          {stats.last_ingestion_at && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              最近摄入: <span className="font-semibold text-slate-700 font-mono">{formatDateTimeFull(stats.last_ingestion_at)}</span>
            </div>
          )}
          {stats.last_qa_at && (
            <div className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-slate-400" />
              最近对话: <span className="font-semibold text-slate-700 font-mono">{formatDateTimeFull(stats.last_qa_at)}</span>
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
        {/* Row 1: KB chips */}
        <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">知识库</span>
          {[{ id: "all", name: "全部", count: ctxDocs.length } as any, ...knowledgeBases.map((kb) => ({ id: String(kb.id), name: kb.name, count: kb.doc_count }))].map((kb) => (
            <button
              key={kb.id}
              onClick={() => { setKbFilter(kb.id); setPage(1); }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                kbFilter === kb.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {kb.name}
              <span className={`text-[10px] ${kbFilter === kb.id ? "text-indigo-200" : "text-slate-400"}`}>
                {kb.count}
              </span>
            </button>
          ))}
        </div>

        {/* Row 2: status filter + search */}
        <div className="px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">状态</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: "all", label: "全部", icon: null },
              { key: "success", label: "已完成", icon: <CheckCircle className="h-3 w-3" /> },
              { key: "parsing", label: "解析中", icon: <RefreshCw className="h-3 w-3" /> },
              { key: "failed", label: "失败", icon: <XCircle className="h-3 w-3" /> },
              { key: "disabled", label: "已禁用", icon: <EyeOff className="h-3 w-3" /> },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => { setStatusFilter(s.key); setPage(1); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  statusFilter === s.key
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>

          {/* Search + count */}
          <div className="flex-1 flex items-center gap-2 ml-auto">
            <div className="relative flex-1 max-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索文档名称..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-slate-700"
              />
            </div>
            <span className="text-[11px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
              共 {totalDocs} 条
            </span>
          </div>
        </div>
      </div>

      {/* Document Table */}
      <DocumentTable
        opsMode={true}
        opsDocuments={opsDocs}
        onRefresh={() => {
          loadDocs(); loadStats();
          setTimeout(() => { loadDocs(); loadStats(); }, 5000);
          setTimeout(() => { loadDocs(); loadStats(); }, 10000);
        }}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm select-none">
          <span className="text-xs text-slate-500">
            第 {page} / {totalPages} 页 · 共 {totalDocs} 条
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // show pages around current
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === page
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
