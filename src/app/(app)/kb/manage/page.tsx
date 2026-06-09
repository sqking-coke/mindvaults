"use client";

import React, { useState } from "react";
import { Sparkles, Tag, Heart, Clock } from "lucide-react";
import InsightReview from "@/components/insights/InsightReview";
import SchedulerPanel from "@/components/insights/SchedulerPanel";
import ConceptPanel from "@/components/concepts/ConceptPanel";
import HealthCenter from "@/components/health/HealthCenter";

type GovTab = "insights" | "concepts" | "health" | "scheduler";

const TABS: { key: GovTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "insights", label: "知识审核", icon: <Sparkles className="h-4 w-4" />, desc: "审核对话提炼的知识点" },
  { key: "concepts", label: "概念管理", icon: <Tag className="h-4 w-4" />, desc: "术语抽取与关联图谱" },
  { key: "health", label: "健康中心", icon: <Heart className="h-4 w-4" />, desc: "知识库质量监控与治理" },
  { key: "scheduler", label: "定时任务", icon: <Clock className="h-4 w-4" />, desc: "定时提炼与清理任务的状态和手动触发" },
];

export default function ManagePage() {
  const [activeTab, setActiveTab] = useState<GovTab>("insights");

  return (
    <>
      {/* Mobile header bar */}
      <header className="h-16 shrink-0 md:hidden flex items-center justify-between px-6 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 select-none">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">数据治理</span>
        </div>
      </header>

      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="space-y-6 max-w-7xl mx-auto p-6 font-sans">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 select-none">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">数据治理</h1>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                知识闭环核心：对话提炼审核、概念关联管理、内容质量治理、系统运行监控。
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">模块</span>
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
            {/* Active tab description */}
            <div className="px-5 pb-3 border-t border-slate-50">
              <p className="text-[11px] text-slate-400 pt-2">
                {TABS.find(t => t.key === activeTab)?.desc}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "insights" && <InsightReview />}
          {activeTab === "concepts" && <ConceptPanel />}
          {activeTab === "health" && <HealthCenter />}
          {activeTab === "scheduler" && <SchedulerPanel />}
        </div>
      </div>
    </>
  );
}
