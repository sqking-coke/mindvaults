"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { fetchOverviewStats, type OverviewStats } from "@/services/ragService";
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
  HardDrive
} from "lucide-react";
import DocumentTable from "./DocumentTable";

export default function KBOpsPanel() {
  const { documents } = usemindvaults();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOverviewStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load overview stats:", err);
      // Fallback: calculate stats from the local documents state
      const totalDocs = documents.length;
      const disabledDocs = documents.filter(d => d.status === "disabled").length;
      const processingDocs = documents.filter(d => d.status === "parsing").length;
      const activeDocs = totalDocs - disabledDocs - processingDocs;
      // Calculate total chunks roughly by summing characters / 400
      const totalChunks = documents.reduce((sum, d) => sum + (d.chars || 0), 0);
      
      setStats({
        total_documents: totalDocs,
        active_documents: activeDocs,
        disabled_documents: disabledDocs,
        processing_documents: processingDocs,
        total_chunks: totalChunks,
        total_qa_records: 0,
        avg_similarity: 0,
        total_storage_bytes: 0,
        last_ingestion_at: null,
        last_qa_at: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [documents]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Format bytes helper
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
            对本地 RAG 知识库物理文件、分块切片及召回状态进行深度维护，支持启用/禁用文档召回、手动重建切片索引及切片内容高保真编辑。
          </p>
        </div>

        <button
          onClick={loadStats}
          disabled={isLoading}
          className="mt-4 md:mt-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all focus:outline-none"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-indigo-500" : ""}`} />
          刷新看板
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        {/* Total Documents Card */}
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

        {/* Total Chunks Card */}
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

        {/* Disabled Documents Card */}
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

        {/* Processing/Parsing Documents Card */}
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
              最近摄入管道更新时间: <span className="font-semibold text-slate-700 font-mono">{formatDateTimeFull(stats.last_ingestion_at)}</span>
            </div>
          )}
          {stats.last_qa_at && (
            <div className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-slate-400" />
              最近对话检索调用时间: <span className="font-semibold text-slate-700 font-mono">{formatDateTimeFull(stats.last_qa_at)}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Table View */}
      <DocumentTable opsMode={true} />
    </div>
  );
}