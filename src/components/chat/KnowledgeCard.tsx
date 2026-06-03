"use client";

import React, { useRef, useState } from "react";
import type { Citation } from "@/types/api";
import { Download, X, Palette, Share2 } from "lucide-react";

interface KnowledgeCardProps {
  question: string;
  answer: string;
  citations: Citation[];
  onClose: () => void;
}

type Skin = "minimal" | "dark" | "blue";

const SKINS: Record<Skin, { bg: string; text: string; accent: string; card: string; badge: string }> = {
  minimal: {
    bg: "bg-gradient-to-br from-stone-50 to-amber-50",
    text: "text-stone-900",
    accent: "text-amber-700",
    card: "bg-white border-stone-200",
    badge: "bg-amber-100 text-amber-800",
  },
  dark: {
    bg: "bg-gradient-to-br from-slate-900 to-slate-800",
    text: "text-slate-100",
    accent: "text-indigo-400",
    card: "bg-slate-800 border-slate-700",
    badge: "bg-indigo-900/50 text-indigo-300",
  },
  blue: {
    bg: "bg-gradient-to-br from-blue-50 via-white to-indigo-50",
    text: "text-slate-800",
    accent: "text-blue-700",
    card: "bg-white border-blue-200",
    badge: "bg-blue-100 text-blue-800",
  },
};

export default function KnowledgeCard({ question, answer, citations, onClose }: KnowledgeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [skin, setSkin] = useState<Skin>("minimal");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `mindvaults-知识卡片-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("导出失败:", err);
    } finally {
      setExporting(false);
    }
  };

  const s = SKINS[skin];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg flex flex-col gap-3 max-h-[90vh]">
        {/* toolbar */}
        <div className="flex items-center justify-between bg-white/90 backdrop-blur rounded-xl px-4 py-2 shadow-lg border border-slate-200">
          <div className="flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-slate-500" />
            {(["minimal", "dark", "blue"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSkin(k)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  skin === k ? "border-indigo-500 scale-110" : "border-transparent opacity-60 hover:opacity-100"
                } ${
                  k === "minimal"
                    ? "bg-amber-100"
                    : k === "dark"
                      ? "bg-slate-800"
                      : "bg-blue-100"
                }`}
                title={k === "minimal" ? "高雅极简" : k === "dark" ? "暗黑科技" : "企业蓝"}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "导出中..." : "下载 PNG"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* card preview — scrollable for long content */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl">
          <div
            ref={cardRef}
            className={`${s.bg} rounded-2xl p-6 shadow-2xl border border-slate-200/50`}
          >
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-white" />
            </div>
            <span className={`text-xs font-bold tracking-wider ${s.accent}`}>mindvaults 知识卡片</span>
          </div>

          <h3 className={`text-base font-bold mb-3 ${s.text}`}>{question}</h3>

          <div className={`${s.card} rounded-xl p-4 border mb-3`}>
            <p className={`text-sm leading-relaxed whitespace-pre-wrap ${s.text}`}>{answer}</p>
          </div>

          {citations.length > 0 && (
            <div className="space-y-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${s.accent}`}>
                参考来源 ({citations.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c) => (
                  <span key={c.id} className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${s.badge}`}>
                    [{c.index}] {c.docName}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={`mt-4 pt-3 border-t ${skin === "dark" ? "border-slate-700" : "border-slate-200"} flex items-center justify-between`}>
            <span className={`text-[10px] ${skin === "dark" ? "text-slate-500" : "text-slate-400"}`}>
              由 mindvaults 本地私有知识库生成
            </span>
            <span className={`text-[10px] font-mono ${skin === "dark" ? "text-slate-600" : "text-slate-300"}`}>
              {new Date().toLocaleDateString("zh-CN")}
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
