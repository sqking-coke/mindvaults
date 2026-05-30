"use client";

import React, { useRef, useEffect } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { 
  Send, 
  Terminal, 
  Paperclip 
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
    systemConfig
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
            {/* Utilities shortcut bar */}
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => alert("此原型已自动关联当前已存储的本地向量数据库。")}
                className="text-slate-400 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-slate-200/50 transition-all duration-150 flex items-center gap-1 text-[11px]"
                title="知识库设置"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="hidden sm:inline font-semibold">附加本地知识库</span>
              </button>
              
              <div className="h-3 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
              
              <span className="text-[10px] text-slate-400 hidden sm:inline-flex items-center gap-1">
                <Terminal className="h-3 w-3 text-indigo-400" />
                <span>按 Enter 发送 / Shift+Enter 换行</span>
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
