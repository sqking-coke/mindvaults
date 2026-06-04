"use client";

import React from "react";
import { 
  FileText, 
  MessageSquare, 
  HelpCircle, 
  Sparkles, 
  TrendingUp,
  Database,
  ShieldCheck,
  Zap
} from "lucide-react";
import type { OverviewStats } from "@/types/api";

interface OverviewCardsProps {
  stats: OverviewStats | null;
  totalUniqueQuestions: number | null;
  isLoading: boolean;
}

export default function OverviewCards({ stats, totalUniqueQuestions, isLoading }: OverviewCardsProps) {
  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 animate-pulse shadow-sm">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-slate-100 rounded-md w-24"></div>
              <div className="h-9 w-9 bg-slate-100 rounded-xl"></div>
            </div>
            <div className="space-y-2">
              <div className="h-7 bg-slate-100 rounded-lg w-16"></div>
              <div className="h-3 bg-slate-100 rounded-md w-32"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const formatSimilarity = (val: number | undefined) => {
    if (val === undefined || val === null) return "—";
    // If it's already between 0 and 100 (e.g. 85), or 0 and 1 (e.g. 0.85)
    const factor = val <= 1 ? 100 : 1;
    return `${(val * factor).toFixed(1)}%`;
  };

  const cards = [
    {
      title: "物理文档总量",
      value: stats?.total_documents ?? "—",
      icon: <FileText className="h-5 w-5" />,
      iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100",
      description: (
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
          <span>{stats?.active_documents ?? 0} 个在线召回</span>
          {stats && stats.disabled_documents > 0 && (
            <span className="text-slate-400">({stats.disabled_documents} 禁用)</span>
          )}
        </span>
      ),
    },
    {
      title: "问答对话总量",
      value: stats?.total_qa_records ?? "—",
      icon: <MessageSquare className="h-5 w-5" />,
      iconBg: "bg-blue-50 text-blue-600 border border-blue-100",
      description: (
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-blue-500 shrink-0" />
          <span>累计复盘及生成问答</span>
        </span>
      ),
    },
    {
      title: "高频唯一问题",
      value: totalUniqueQuestions ?? "—",
      icon: <HelpCircle className="h-5 w-5" />,
      iconBg: "bg-amber-50 text-amber-600 border border-amber-100",
      description: (
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
          <span>提炼出的核心高频问题数</span>
        </span>
      ),
    },
    {
      title: "检索平均相似度",
      value: formatSimilarity(stats?.avg_similarity),
      icon: <Sparkles className="h-5 w-5" />,
      iconBg: "bg-violet-50 text-violet-600 border border-violet-100",
      description: (
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3 text-violet-500 shrink-0" />
          <span>切片数: {stats?.total_chunks ?? 0} ({formatBytes(stats?.total_storage_bytes ?? 0)})</span>
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 select-none">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex items-start justify-between relative overflow-hidden group"
        >
          {/* Subtle bottom highlight on hover */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {card.title}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-800 block font-mono">
                {card.value.toLocaleString()}
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 leading-relaxed">
              {card.description}
            </div>
          </div>

          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm ${card.iconBg}`}>
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  );
}