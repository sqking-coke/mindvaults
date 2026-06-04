"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  fetchInsights,
} from "@/services/ragService";
import type { Insight } from "@/types/api";
import {
  Sparkles,
  Layers,
  Clock,
  MessageSquare,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Tag,
  RefreshCw,
  Database,
} from "lucide-react";

type SourceTab = "qa" | "skill";

const TABS: { key: SourceTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "qa", label: "本地 QA", icon: <MessageSquare className="h-3.5 w-3.5" />, desc: "从内部问答对话中提炼的知识点" },
  { key: "skill", label: "外部 Skill", icon: <ArrowUpRight className="h-3.5 w-3.5" />, desc: "从 Claude Code 等外部平台推送的知识点" },
];

export default function SystemKBHome() {
  const [activeTab, setActiveTab] = useState<SourceTab>("qa");

  // Stats
  const [insightCounts, setInsightCounts] = useState({ approved: 0, pending: 0 });

  // List
  const [insights, setInsights] = useState<Insight[]>([]);
  const [monthlyNew, setMonthlyNew] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [approvedData, pendingData] = await Promise.all([
        fetchInsights(1, "approved", 1, 100),
        fetchInsights(1, "pending", 1, 1),
      ]);
      setInsightCounts({ approved: approvedData.total, pending: pendingData.total });

      // 本月新增
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthCount = approvedData.items.filter((ins) => ins.created_at.startsWith(thisMonth)).length;
      setMonthlyNew(monthCount);

      // 按来源过滤
      const allItems = approvedData.items;
      if (activeTab === "qa") {
        setInsights(allItems.filter((ins) => ins.source_qa_ids && ins.source_qa_ids.length > 0));
      } else {
        setInsights(allItems.filter((ins) => !ins.source_qa_ids || ins.source_qa_ids.length === 0));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-slate-800 text-sm">默认系统库</h1>
            <p className="text-[10px] text-slate-400 truncate">系统自动创建的核心知识库 · 承载文档存储与对话知识沉淀</p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
          刷新
        </button>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-7xl mx-auto p-6 space-y-6">

          {/* Overview Cards — 只展示知识沉淀指标 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 select-none">
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">沉淀知识点</span>
                <span className="text-2xl font-black text-green-700 block font-mono">{insightCounts.approved}</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                  已入库参与 RAG 检索
                </span>
              </div>
              <div className="h-10 w-10 shrink-0 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">待审核</span>
                <span className={`text-2xl font-black block font-mono ${insightCounts.pending > 0 ? "text-amber-600" : "text-slate-500"}`}>{insightCounts.pending}</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                  等待人工确认
                </span>
              </div>
              <div className="h-10 w-10 shrink-0 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">关联切片</span>
                <span className="text-2xl font-black text-slate-800 block font-mono">{insightCounts.approved}</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Layers className="h-3 w-3 text-violet-500 shrink-0" />
                  已落地为可检索向量
                </span>
              </div>
              <div className="h-10 w-10 shrink-0 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600">
                <Layers className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-start justify-between">
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">本月新增</span>
                <span className="text-2xl font-black text-slate-800 block font-mono">{monthlyNew}</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                  持续沉淀积累中
                </span>
              </div>
              <div className="h-10 w-10 shrink-0 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Source Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="px-5 py-3 flex items-center gap-2 flex-wrap border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">来源</span>
              {TABS.map((tab) => (
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
                </button>
              ))}
            </div>
            <div className="px-5 py-2 text-[11px] text-slate-400">
              {TABS.find((t) => t.key === activeTab)?.desc}
            </div>
          </div>

          {/* Knowledge List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
            </div>
          ) : insights.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 select-none">
                <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                  <Sparkles className="h-7 w-7 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500 mb-1">
                  {activeTab === "qa" ? "暂无本地 QA 沉淀知识点" : "暂无外部 Skill 沉淀知识点"}
                </p>
                <p className="text-xs text-slate-400">
                  {activeTab === "qa"
                    ? "在对话中点击「保存到知识库」或等待每日自动提炼"
                    : "配置 Skill 集成后，外部对话知识将自动推送至此"}
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
                    {/* Title + Tags */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-lg mt-0.5 shrink-0">💡</span>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-800 text-sm leading-snug">{insight.title}</h3>
                          {insight.tags && insight.tags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1.5">
                              <Tag className="h-3 w-3 text-slate-400 shrink-0" />
                              {insight.tags.map((t, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Confidence */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.round(insight.confidence * 100)}%`, backgroundColor: "#22c55e" }}
                          />
                        </div>
                        <span className="text-xs font-bold font-mono text-green-600 w-8 text-right">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="ml-8">
                      <p className={`text-sm text-slate-600 leading-relaxed ${expandedIds.has(insight.id) ? "" : "line-clamp-2"}`}>
                        {insight.content}
                      </p>
                      {insight.content.length > 100 && (
                        <button
                          onClick={() => toggleExpand(insight.id)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 flex items-center gap-1 font-medium"
                        >
                          {expandedIds.has(insight.id) ? (
                            <><ChevronUp className="h-3 w-3" /> 收起</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> 展开</>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="ml-8 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {insight.source_qa_ids.length} 条对话来源
                        </span>
                        <span>{insight.created_at.slice(0, 10)}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium">
                        已入库
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
