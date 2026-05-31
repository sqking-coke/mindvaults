"use client";

import React from "react";
import Link from "next/link";
import { CHANGELOG } from "@/data/changelog";
import { ArrowLeft, GitCommit, Sparkles } from "lucide-react";

const TAG_CONFIG: Record<string, { bg: string; text: string }> = {
  feature: { bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
  fix: { bg: "bg-amber-50 border-amber-100", text: "text-amber-700" },
  docs: { bg: "bg-blue-50 border-blue-100", text: "text-blue-700" },
  refactor: { bg: "bg-violet-50 border-violet-100", text: "text-violet-700" },
  infra: { bg: "bg-slate-100 border-slate-200", text: "text-slate-600" },
};

const TAG_NAMES: Record<string, string> = {
  feature: "功能",
  fix: "修复",
  docs: "文档",
  refactor: "重构",
  infra: "基础",
};

export default function ChangelogPage() {
  const [activeTag, setActiveTag] = React.useState<string | null>(null);

  const filtered = activeTag
    ? CHANGELOG.filter((e) => e.tags.includes(activeTag as any))
    : CHANGELOG;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              更新日志
            </h1>
          </div>

          {/* Tag Filter */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveTag(null)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                !activeTag
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              全部
            </button>
            {Object.entries(TAG_NAMES).map(([key, label]) => (
              <button
                key={key}
                onClick={() =>
                  setActiveTag(activeTag === key ? null : key)
                }
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                  activeTag === key
                    ? `${TAG_CONFIG[key].text} ${TAG_CONFIG[key].bg} border-current`
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Timeline */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />

          <div className="space-y-8">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                该分类暂无记录
              </div>
            ) : (
              filtered.map((entry) => (
                <div key={entry.version} className="relative flex gap-6 pl-1">
                  {/* Dot */}
                  <div className="absolute left-5 w-2.5 h-2.5 rounded-full bg-white border-2 border-indigo-500 -translate-x-[5px] mt-2 z-10" />

                  {/* Spacer for line */}
                  <div className="w-10 shrink-0" />

                  {/* Card */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-mono">
                        {entry.version}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {entry.date}
                      </span>
                      <div className="flex gap-1">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_CONFIG[tag].bg} ${TAG_CONFIG[tag].text}`}
                          >
                            {TAG_NAMES[tag]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1.5">
                      {entry.title}
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed">
                      {entry.description}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-slate-200">
          <Link
            href="/"
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
