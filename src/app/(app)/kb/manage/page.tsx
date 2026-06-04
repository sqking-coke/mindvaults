"use client";

import React, { useState } from "react";
import { Sparkles, Tag, Heart, Activity } from "lucide-react";
import InsightReview from "@/components/insights/InsightReview";

type GovTab = "insights" | "concepts" | "health" | "monitor";

const TABS: { key: GovTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "insights", label: "知识审核", icon: <Sparkles className="h-4 w-4" />, desc: "审核对话提炼的知识点" },
  { key: "concepts", label: "概念管理", icon: <Tag className="h-4 w-4" />, desc: "术语抽取与关联图谱" },
  { key: "health", label: "健康中心", icon: <Heart className="h-4 w-4" />, desc: "知识库质量监控与治理" },
  { key: "monitor", label: "监控看板", icon: <Activity className="h-4 w-4" />, desc: "系统事件与告警记录" },
];

function PlaceholderPanel({ title, icon, description }: { title: string; icon: React.ReactNode; description: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 select-none">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-500 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md text-center leading-relaxed">{description}</p>
      <div className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-500 border border-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        功能开发中，敬请期待
      </div>
    </div>
  );
}

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
          {activeTab === "concepts" && (
            <PlaceholderPanel
              title="概念管理"
              icon={<Tag className="h-8 w-8" />}
              description="自动从文档中抽取术语、建立概念关联图谱、支持 hover 即时解释，让 RAG 上下文更精准。"
            />
          )}
          {activeTab === "health" && (
            <PlaceholderPanel
              title="健康中心"
              icon={<Heart className="h-8 w-8" />}
              description="定期扫描知识库内容质量：重复检测、过时标记、短碎片清理、整体健康度量化评分。"
            />
          )}
          {activeTab === "monitor" && (
            <PlaceholderPanel
              title="监控看板"
              icon={<Activity className="h-8 w-8" />}
              description="统一事件总线：提炼任务状态、检索异常、系统资源告警，所有关键事件一览无余。"
            />
          )}
        </div>
      </div>
    </>
  );
}
