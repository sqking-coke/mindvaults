"use client";

import React, { useState, useMemo } from "react";
import type { Citation } from "@/types/api";
import { X, Check, Copy } from "lucide-react";
import { generateFullWechatHTML } from "@/utils/wechatFormat";

interface WechatExportProps {
  question: string;
  answer: string;
  citations: Citation[];
  onClose: () => void;
}

export default function WechatExport({ question, answer, citations, onClose }: WechatExportProps) {
  const [copied, setCopied] = useState(false);

  // Compute our formatted preview HTML (only recalculated when dependencies change)
  const previewHtml = useMemo(() => {
    return generateFullWechatHTML(question, answer, citations);
  }, [question, answer, citations]);

  const handleCopy = async () => {
    try {
      // Assemble standard plain text fallback
      const citationsText = citations
        .map((c) => `[${c.index}] ${c.docName} (第 ${c.page || 1} 页)`)
        .join("\n");
      const plainText = `【提问】\n${question}\n\n【回答】\n${answer}\n\n${
        citations.length > 0 ? `【引用来源】\n${citationsText}\n\n` : ""
      }由 mindvaults 智能知识库优雅排版生成。`;

      // Formulate HTML and plain text blobs
      const htmlBlob = new Blob([previewHtml], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });

      // Write multi-mime format to clipboard
      const clipboardData = [
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ];

      await navigator.clipboard.write(clipboardData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("无法写入剪贴板 (HTML格式):", err);
      // Fallback to plain-text copy if rich text is blocked by permissions
      try {
        await navigator.clipboard.writeText(answer);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        alert("复制失败，请尝试手动选中并复制。");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-xl flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] border border-slate-200">

        {/* Header toolbar */}
        <div className="flex items-center justify-between border-b border-slate-150 px-5 py-4 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.5,13.5A1.5,1.5 0 0,1 7,12A1.5,1.5 0 0,1 8.5,10.5A1.5,1.5 0 0,1 10,12A1.5,1.5 0 0,1 8.5,13.5M15.5,13.5A1.5,1.5 0 0,1 14,12A1.5,1.5 0 0,1 15.5,10.5A1.5,1.5 0 0,1 17,12A1.5,1.5 0 0,1 15.5,13.5M12,2A10,10 0 0,0 2,12C2,14.65 3,17.06 4.7,18.9L3.3,21.7C3.13,22.04 3.26,22.45 3.6,22.61C3.7,22.66 3.82,22.7 3.93,22.7C4.17,22.7 4.4,22.56 4.5,22.33L6.14,19.05C7.81,20.27 9.83,21 12,21A10,10 0 0,0 22,11A10,10 0 0,0 12,2M12,20C10.15,20 8.44,19.38 7.05,18.35L6.85,18.2L6.6,18.7L5.5,20.9L6.5,18.9L6.6,18.7L6.4,18.52C4.9,17 4,14.94 4,12C4,7.58 7.58,4 12,4C16.42,4 20,7.58 20,12C20,16.42 16.42,20 12,20Z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-800">微信公众号排版优雅导出</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="关闭窗口"
            aria-label="关闭窗口"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info panel */}
        <div className="bg-emerald-50/75 border-b border-emerald-100/50 px-5 py-3 text-xs text-emerald-800 leading-relaxed">
          💡 已为您完成公众号专属格式转换。复制成果后，直接在微信公众号后台编辑器中粘贴 (Ctrl+V) 即可。我们将完美保留符合移动端阅读的
          <strong>安全色字栈</strong>、<strong>1.75倍黄金行距</strong>、<strong>优雅引用卡片</strong>及<strong>底端溯源标注</strong>。
        </div>

        {/* Content Preview scrollbox */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-100/50">
          <div className="mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            排版预览区域 (微信内实际渲染效果)
          </div>
          {/* Render the fully inlined HTML output */}
          <div
            className="p-1"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        {/* Action footer */}
        <div className="flex items-center justify-between border-t border-slate-150 px-5 py-4 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors bg-white hover:bg-slate-50 border border-slate-250 rounded-xl"
          >
            关闭预览
          </button>
          
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
              copied
                ? "bg-emerald-600 shadow-emerald-500/10"
                : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/15"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 animate-scale-up" />
                <span>复制成功！去公众号粘贴</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>一键复制排版成果</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
