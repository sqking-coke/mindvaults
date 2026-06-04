"use client";

import React, { useRef, useEffect, useState } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import {
  Send,
  Search,
  Check,
  Terminal,
} from "lucide-react";

interface ChatInputAreaProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
}

export default function ChatInputArea({ input, setInput }: ChatInputAreaProps) {
  const {
    activeConversationId,
    sendMessage,
    isGenerating,
    systemConfig,
    knowledgeBases,
    activeKbId,
    setActiveKbId,
  } = usemindvaults();

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConversationId]);

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <footer className="p-4 md:p-6 border-t border-slate-200 bg-white select-none z-10 shrink-0">
      <div className="max-w-3xl mx-auto space-y-2.5">
        {/* Input wrapper */}
        <div className="relative border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 rounded-xl bg-slate-50 overflow-hidden transition-all duration-200 shadow-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息，或输入关键词提问有关系统架构或弹性休假的规定..."
            rows={2}
            disabled={isGenerating}
            className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none px-4 py-3 text-sm text-slate-800 placeholder-slate-400 resize-none font-sans leading-relaxed"
          />

          <div className="flex items-center justify-between px-4 pb-2 shrink-0 border-t border-slate-150 pt-2.5 bg-slate-50/50">
            <div className="flex items-center gap-2">
              {/* Scope selector with floating panel */}
              <KbScopeSelector
                knowledgeBases={knowledgeBases}
                activeKbId={activeKbId}
                setActiveKbId={setActiveKbId}
                isGenerating={isGenerating}
              />

              <span className="text-[10px] text-slate-400 hidden sm:inline-flex items-center gap-1">
                <Terminal className="h-3 w-3 text-indigo-400" />
                按 Enter 发送 / Shift+Enter 换行
              </span>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 text-white font-medium py-1.5 px-4 rounded-xl shadow shadow-indigo-600/10 transition-all duration-150 text-xs shrink-0"
            >
              发送消息
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom model diagnostics */}
        <p className="text-[10px] text-slate-400 text-center select-none flex items-center justify-center gap-1 leading-normal">
          <span>模型内核: <b>{systemConfig?.llm_model || "未配置"}</b> ({systemConfig?.llm_provider === "ollama" ? "本地运行" : "云端 API"})</span>
          <span>•</span>
          <span>检索模式: <b>HNSW 向量粗排 + BCE Reranker 重排精选</b></span>
        </p>
      </div>
    </footer>
  );
}

// ── KB Scope Selector (Scheme C: Floating Panel) ──

interface KbScopeSelectorProps {
  knowledgeBases: { id: number; name: string; doc_count: number }[];
  activeKbId: string | null;
  setActiveKbId: (id: string | null) => void;
  isGenerating: boolean;
}

function KbScopeSelector({
  knowledgeBases,
  activeKbId,
  setActiveKbId,
  isGenerating,
}: KbScopeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ bottom: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const openPanel = () => {
    if (isGenerating) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left });
    }
    setOpen(true);
  };

  const isAuto = !activeKbId;
  const isAll = activeKbId === "0";
  const selectedKb = knowledgeBases.find((kb) => String(kb.id) === activeKbId);

  const currentLabel = isAuto
    ? "自动（智能路由）"
    : isAll
      ? "全库搜索"
      : selectedKb?.name || "自动（智能路由）";

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={isGenerating}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
      >
        <Search className="h-3 w-3 text-indigo-400 shrink-0" />
        <span className="truncate max-w-[140px]">{currentLabel}</span>
        <svg
          className={`h-2.5 w-2.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 8 5"
          fill="currentColor"
        >
          <path d="M0 0l4 5 4-5z" />
        </svg>
      </button>

      {/* Floating Panel — fixed positioning to escape overflow */}
      {open && (
        <div
          className="fixed bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-[190px] z-[9999]"
          style={{ bottom: panelPos.bottom, left: panelPos.left }}
        >

          <div className="max-h-[180px] overflow-y-auto">
            {knowledgeBases.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-400">暂无知识库</div>
            ) : (
              knowledgeBases.map((kb) => (
                <KbScopeItem
                  key={kb.id}
                  label={kb.name}
                  description={`${kb.doc_count} 篇文档`}
                  selected={activeKbId === String(kb.id)}
                  onClick={() => {
                    setActiveKbId(String(kb.id));
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>

          <div className="mx-3 my-1 border-t border-slate-100" />

          <KbScopeItem
            label="全库搜索"
            description="跨所有知识库检索"
            selected={isAll}
            onClick={() => {
              setActiveKbId("0");
              setOpen(false);
            }}
          />
          <KbScopeItem
            label="自动（智能路由）"
            description="系统自动选择最佳知识库"
            selected={isAuto}
            onClick={() => {
              setActiveKbId(null);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function KbScopeItem({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        selected ? "bg-indigo-50" : "hover:bg-slate-50"
      }`}
    >
      {/* Radio indicator */}
      <span
        className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? "border-indigo-500" : "border-slate-300"
        }`}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
      </span>

      <div className="flex-1 min-w-0">
        <div
          className={`text-xs font-medium truncate ${
            selected ? "text-indigo-700" : "text-slate-700"
          }`}
        >
          {label}
        </div>
        <div className="text-[10px] text-slate-400 truncate">{description}</div>
      </div>

      {selected && <Check className="h-3 w-3 text-indigo-500 shrink-0" />}
    </button>
  );
}
