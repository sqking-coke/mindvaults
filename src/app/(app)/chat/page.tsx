"use client";

import React, { useState } from "react";
import CitationDrawer from "@/components/chat/CitationDrawer";
import ChatMessageList from "@/components/chat/ChatMessageList";
import ChatInputArea from "@/components/chat/ChatInputArea";
import { usemindvaults } from "@/context/mindvaultsContext";
import { ShieldCheck } from "lucide-react";

export default function ChatPage() {
  const { 
    conversations, 
    activeConversationId, 
    knowledgeBases,
    systemConfig,
    ollamaModels,
    updateSystemConfig,
    loadOllamaModels
  } = usemindvaults();

  const [input, setInput] = useState("");

  // Fetch Ollama models when mounting
  React.useEffect(() => {
    if (systemConfig?.llm_provider === "ollama" && ollamaModels.length === 0) {
      loadOllamaModels();
    }
  }, [systemConfig, ollamaModels, loadOllamaModels]);

  // Find active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <>
      {/* Main Chat Area Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Chat Page Header */}
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md pl-16 pr-6 md:px-6 flex items-center justify-between shrink-0 z-10 select-none">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <h1 className="font-semibold text-slate-800 text-sm truncate max-w-[120px] md:max-w-[300px]">
              {activeConversation ? activeConversation.title : "本地安全沙盒"}
            </h1>
            <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-medium hidden sm:inline-block">
              局域网物理隔离
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Quick Model Switcher */}
            {systemConfig && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 hidden lg:inline">运行智核:</span>
                <select
                  value={systemConfig.llm_model || ""}
                  onChange={async (e) => {
                    const nextModel = e.target.value;
                    if (nextModel) {
                      await updateSystemConfig({ llm_model: nextModel });
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold px-2 py-1 rounded-lg border border-slate-200 focus:outline-none cursor-pointer transition-colors max-w-[130px] md:max-w-[200px] truncate"
                  title="点击即时切换大模型智核"
                >
                  <option value={systemConfig.llm_model}>{systemConfig.llm_model}</option>
                  {systemConfig.llm_provider === "ollama" ? (
                    ollamaModels
                      .filter((m) => m !== systemConfig.llm_model)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))
                  ) : (
                    (() => {
                      const preset = ["deepseek-v4-pro", "deepseek-v4-flash", "gpt-4o", "gpt-3.5-turbo"];
                      const current = systemConfig.llm_model;
                      // 自定义模型也加入可选列表
                      const list = current && !preset.includes(current) ? [...preset, current] : preset;
                      return list
                        .filter((m) => m !== systemConfig.llm_model)
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ));
                    })()
                  )}
                </select>
              </div>
            )}

            {/* Connected KB Badge */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>关联 <b>{knowledgeBases.length}</b> 个本地知识库</span>
            </div>
            
            {/* Security Indicator */}
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10.5px] font-bold px-2 py-1 rounded-lg border border-emerald-100 shadow-sm shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">数据不出域</span>
            </div>
          </div>
        </header>

        {/* Messages Scroll Zone */}
        <ChatMessageList onSelectTemplate={setInput} />

        {/* Input Bar panel */}
        <ChatInputArea input={input} setInput={setInput} />
      </div>

      {/* Slide-out Citation Source Details Panel */}
      <CitationDrawer />
    </>
  );
}
