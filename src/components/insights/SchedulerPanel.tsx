"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchScheduleStatus } from "@/services/ragService";
import type { ScheduleStatus } from "@/services/ragService";
import { Clock, RefreshCw, Zap, Trash2, Layers, Play } from "lucide-react";

export default function SchedulerPanel() {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchScheduleStatus();
      setStatus(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch("/api/v1/kb/insights/extract", { method: "POST" });
      const json = await res.json();
      if (json.code === 0) {
        const d = json.data;
        setTriggerResult(
          `提炼 ${d.extracted} 条 · 跳过 ${d.skipped_short + d.skipped_duplicate} 条 · 自动通过 ${d.auto_approved} 条`
        );
      } else {
        setTriggerResult(`失败: ${json.message}`);
      }
      await load();
    } catch (err) {
      setTriggerResult(`请求失败: ${err}`);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">无法加载定时任务状态</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">提炼任务</span>
            <span className={`text-2xl font-black block font-mono ${status.extraction_enabled ? "text-green-600" : "text-slate-400"}`}>
              {status.extraction_enabled ? "运行中" : "已暂停"}
            </span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              每日 {status.extraction_schedule} 执行
            </span>
          </div>
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${status.extraction_enabled ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
            <Zap className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">下次执行</span>
            <span className="text-2xl font-black text-slate-800 block font-mono text-sm">{status.next_extraction_at}</span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 shrink-0" />
              提炼 + 清理同步触发
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">待处理队列</span>
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-black text-blue-600 font-mono">{status.pending_native_count}<span className="text-[10px] font-normal text-slate-400 ml-1">本地</span></span>
              <span className="text-lg font-black text-violet-600 font-mono">{status.pending_external_count}<span className="text-[10px] font-normal text-slate-400 ml-1">外部</span></span>
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Layers className="h-3 w-3 shrink-0" />
              等待下次定时提炼
            </span>
          </div>
          <div className="h-10 w-10 shrink-0 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">待清理</span>
            <span className={`text-2xl font-black block font-mono ${status.stale_external_count > 0 ? "text-red-500" : "text-slate-500"}`}>
              {status.stale_external_count}
            </span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Trash2 className="h-3 w-3 shrink-0" />
              3 天未提炼 → 自动删除
            </span>
          </div>
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${status.stale_external_count > 0 ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-400"}`}>
            <Trash2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Manual Trigger + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manual Trigger */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Play className="h-4 w-4 text-indigo-500" />
            手动触发提炼
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            立即执行一次完整的提炼任务（包含本地 QA 和外部对话），无需等待定时触发。
          </p>
          <button
            onClick={handleTrigger}
            disabled={triggering || !status.extraction_enabled}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-indigo-500/20 transition-all"
          >
            {triggering ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> 执行中...</>
            ) : (
              <><Play className="h-4 w-4" /> 立即执行</>
            )}
          </button>
          {triggerResult && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-mono">
              {triggerResult}
            </div>
          )}
          {!status.extraction_enabled && (
            <p className="mt-3 text-[11px] text-amber-600">
              提炼功能已暂停，请在设置中开启「启用自动提炼」
            </p>
          )}
        </div>

        {/* Rule Detail */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-500" />
            任务规则
          </h3>
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">每日提炼</span>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                每日 {status.extraction_schedule} 自动执行：从本地 QA 记录（48h 内）和外部推送条目中，调用 LLM 提炼独立知识点，写入审核队列。
              </p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">过期清理</span>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                外部推送对话 {">"} 3 天仍未提炼（答案太短或无价值），自动永久删除。本地 QA 记录不受影响。
              </p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">配置入口</span>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                提炼开关、执行时间、最小答案长度、去重/自动通过阈值 → 前往「设置」→「对话知识沉淀」调整。
              </p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">质量门</span>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                答案长度 ≥ 最小答案长度（默认 200 字符）、非命令/代码、非空白，方参与提炼。外部条目还须通过命令/代码特征过滤。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
