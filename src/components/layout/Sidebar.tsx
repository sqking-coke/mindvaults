"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usemindvaults } from "@/context/mindvaultsContext";
import { fetchSystemInfo } from "@/services/ragService";
import type { SystemInfo } from "@/services/ragService";
import {
  MessageSquare,
  Database,
  Plus,
  Trash2,
  Edit3,
  X,
  Cpu,
  HardDrive,
  Layers,
  ChevronLeft,
  Menu,
  Wrench,
  BarChart3,
  Settings,
  Sliders,
  MoreHorizontal,
  Pin,
  PinOff
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    conversations, 
    activeConversationId, 
    setActiveConversationId, 
    addConversation, 
    deleteConversation, 
    renameConversation,
    isGenerating,
    systemConfig,
    ollamaModels,
    loadSystemConfig,
    updateSystemConfig,
    loadOllamaModels
  } = usemindvaults();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  // 客户端挂载后恢复置顶状态，避免 SSR hydration 不匹配
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mv_pinned_conv_ids");
      if (saved) setPinnedIds(new Set<string>(JSON.parse(saved)));
    } catch {}
  }, []);
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 菜单打开时，点击外部自动关闭
  useEffect(() => {
    if (!menuConvId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuConvId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuConvId]);
  const [deleteConvConfirm, setDeleteConvConfirm] = useState<{ id: string; title: string } | null>(null);

  // 获取真实系统信息
  useEffect(() => {
    fetchSystemInfo()
      .then(setSystemInfo)
      .catch(() => {});
  }, []);

  // --- Settings Modal & Local States ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Local Form States
  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topK, setTopK] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);

  // Fetch config on mount
  useEffect(() => {
    if (!systemConfig) {
      loadSystemConfig();
    }
  }, [systemConfig, loadSystemConfig]);

  // Sync state when opening the modal
  const openSettings = () => {
    if (systemConfig) {
      setProvider((systemConfig.llm_provider || "ollama") as "ollama" | "openai");
      setBaseUrl(systemConfig.llm_base_url || "");
      setModel(systemConfig.llm_model || "");
      setApiKey(systemConfig.llm_api_key || "");
      setTemperature(systemConfig.llm_temperature ?? 0.3);
      setSystemPrompt(systemConfig.system_prompt || "");
      setChunkSize(systemConfig.chunk_size ?? 500);
      setChunkOverlap(systemConfig.chunk_overlap ?? 50);
      setTopK(systemConfig.top_k ?? 5);
      setSimilarityThreshold(systemConfig.similarity_threshold ?? 0.7);
    }
    // 只在 Ollama 模式下加载本地模型列表
    if (systemConfig?.llm_provider === "ollama") {
      loadOllamaModels();
    }
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    const success = await updateSystemConfig({
      llm_provider: provider,
      llm_base_url: baseUrl,
      llm_model: model,
      llm_api_key: apiKey,
      llm_temperature: temperature,
      system_prompt: systemPrompt,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      top_k: topK,
      similarity_threshold: similarityThreshold,
    });
    setIsSaving(false);
    if (success) {
      setIsSettingsOpen(false);
    } else {
      alert("保存设置失败，请检查参数格式！");
    }
  };

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  // 置顶状态持久化
  useEffect(() => {
    localStorage.setItem("mv_pinned_conv_ids", JSON.stringify(Array.from(pinnedIds)));
  }, [pinnedIds]);

  // 进入重命名模式时自动全选文本
  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.select();
    }
  }, [editingId]);

  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewChat = () => {
    const newId = addConversation();
    router.push("/chat");
    setMobileOpen(false);
  };

  const isChatActive = pathname.startsWith("/chat");
  const isOpsActive = pathname.startsWith("/kb/ops");
  const isStatsActive = pathname.startsWith("/kb/stats");
  const isKbActive = pathname === "/kb" || (pathname.startsWith("/kb") && !isOpsActive && !isStatsActive);

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed left-4 top-3.5 z-30 p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-center"
        aria-label="打开侧边栏"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
        />
      )}

      {/* Sidebar Container */}
      <div 
        className={`h-full bg-slate-900 text-slate-100 flex flex-col transition-all duration-300 border-r border-slate-800 
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto md:flex shrink-0
          ${isCollapsed ? "md:w-16" : "md:w-64"} w-64
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 select-none shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">mindvaults</span>
              <span className="block text-[10px] text-indigo-400 font-medium tracking-wider">v1.0.0 PROTOTYPE</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center mx-auto shadow-md">
            <Layers className="h-5 w-5 text-white" />
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-expanded={!isCollapsed}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1 rounded-lg transition-colors hidden md:block focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {isCollapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button 
          onClick={() => setMobileOpen(false)}
          aria-label="关闭侧边栏"
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1 rounded-lg transition-colors md:hidden focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Action - New Chat */}
      {!isCollapsed && (
        <div className="px-3 pt-4 pb-2 shrink-0">
          <button
            onClick={handleNewChat}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl shadow-md shadow-indigo-600/10 transition-all duration-200 group text-sm"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            新建对话
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="px-3 py-2 space-y-1 shrink-0">
        <Link
          href="/chat"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            isChatActive 
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>对话沙盒 (Chat)</span>}
        </Link>
        <Link
          href="/kb"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            isKbActive 
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Database className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>知识中心 (KB)</span>}
        </Link>
        <Link
          href="/kb/ops"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            isOpsActive 
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Wrench className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>运维管理 (Ops)</span>}
        </Link>
        <Link
          href="/kb/stats"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            isStatsActive 
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <BarChart3 className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>问答统计 (Stats)</span>}
        </Link>
      </div>

      {/* Conversation List (Only shown if Chat path is active) */}
      {isChatActive && !isCollapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-slate-800/60 flex flex-col min-h-0">
          <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 shrink-0">
            历史对话
          </div>
          <div className="space-y-0.5 flex-1 px-1">
            {conversations.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-600 select-none">
                无历史对话记录
              </div>
            ) : (
              (() => {
                const pinned = conversations.filter(c => pinnedIds.has(c.id));
                const normal = conversations.filter(c => !pinnedIds.has(c.id));
                const sorted = [...pinned, ...normal];

                return (
                  <>
                    {sorted.map((conv, i) => {
                      const isActive = activeConversationId === conv.id;
                      const isEditing = editingId === conv.id;
                      const isPinned = pinnedIds.has(conv.id);
                      const showPinSep = i === pinned.length - 1 && pinned.length > 0 && normal.length > 0;

                      return (
                        <div key={conv.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (!isEditing) {
                                setActiveConversationId(conv.id);
                                setMobileOpen(false);
                              }
                            }}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === " ") && !isEditing) {
                                e.preventDefault();
                                setActiveConversationId(conv.id);
                                setMobileOpen(false);
                              }
                            }}
                            aria-current={isActive ? "true" : "false"}
                            aria-label={`切换到对话: ${conv.title}`}
                            className={`group relative flex items-center justify-between rounded-xl px-3 py-3 text-xs font-medium cursor-pointer transition-all duration-150 border border-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                              isActive
                                ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden w-full pr-8">
                              <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />

                              {isEditing ? (
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                    if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                                  }}
                                  onBlur={() => {
                                    if (editingTitle.trim()) {
                                      renameConversation(conv.id, editingTitle.trim());
                                    }
                                    setEditingId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-transparent text-white px-0 py-1 focus:outline-none w-full font-sans text-sm"
                                  autoFocus
                                />
                              ) : (
                                <span className="truncate pr-2">{conv.title}</span>
                              )}
                            </div>

                            {/* ⋯ 按钮 + 下拉菜单 */}
                            {!isEditing && (
                              <div className="absolute right-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuConvId(menuConvId === conv.id ? null : conv.id);
                                  }}
                                  className={`p-1 rounded-md transition-all focus:outline-none ${
                                    menuConvId === conv.id
                                      ? "bg-slate-700 text-slate-200"
                                      : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-200 hover:bg-slate-700"
                                  }`}
                                  aria-label="更多操作"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>

                                {menuConvId === conv.id && (
                                    <div
                                      ref={menuRef}
                                      className="absolute right-0 top-full mt-1 z-20 w-32 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 animate-fade-in"
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startRename(conv.id, conv.title, e);
                                          setMenuConvId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-700 transition-colors text-left"
                                      >
                                        <Edit3 className="h-3 w-3" />
                                        重命名
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePin(conv.id);
                                          setMenuConvId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-700 transition-colors text-left"
                                      >
                                        {isPinned ? <><PinOff className="h-3 w-3" /> 取消置顶</> : <><Pin className="h-3 w-3" /> 置顶</>}
                                      </button>
                                      <div className="border-t border-slate-700 my-0.5" />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConvConfirm({ id: conv.id, title: conv.title });
                                          setMenuConvId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-red-400 hover:bg-slate-700 transition-colors text-left"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        删除
                                      </button>
                                    </div>
                                )}
                              </div>
                            )}

                          </div>

                          {/* 置顶分隔线 */}
                          {showPinSep && (
                            <div className="flex items-center gap-2 px-3 py-1">
                              <div className="flex-1 h-px bg-slate-700" />
                              <span className="text-[9px] text-slate-600 shrink-0">已置顶</span>
                              <div className="flex-1 h-px bg-slate-700" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Conversation List Placeholder if KB/Ops/Stats is active */}
      {(isKbActive || isOpsActive || isStatsActive) && !isCollapsed && (
        <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 border-t border-slate-800/60 text-center select-none text-slate-600">
          {isOpsActive ? (
            <Wrench className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          ) : isStatsActive ? (
            <BarChart3 className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          ) : (
            <Database className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          )}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            {isOpsActive ? "运维管理中" : isStatsActive ? "问答统计中" : "知识管理中"}
          </p>
          <p className="text-[11px] leading-relaxed max-w-[180px]">
            {isOpsActive 
              ? "对知识库分流切片及文档检索状态进行高级维护。" 
              : isStatsActive 
                ? "多维度分析用户提问倾向，持续优化检索。" 
                : "在右侧视图中切换或建立新的本地知识库文件。"}
          </p>
        </div>
      )}

      {/* System Diagnostics / Metrics Dashboard */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0 select-none">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              本地系统状态
            </span>
            <button
              onClick={openSettings}
              className="p-1 hover:bg-slate-800 hover:text-indigo-400 rounded-lg text-slate-400 transition-colors focus:outline-none"
              title="大模型与系统设置"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="space-y-2.5 text-[11px] text-slate-400">
            {/* Compute core */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-indigo-500 shrink-0" />
                计算设备
              </span>
              <span className="text-slate-200 font-mono truncate" title={systemInfo?.cpu_name}>{systemInfo?.cpu_name || "检测中..."}</span>
            </div>
            {/* Memory indicator */}
            <div className="py-1 border-y border-slate-800/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="h-3 w-3 text-indigo-500 shrink-0" />
                  本地内存
                </span>
                <span className="text-slate-200 font-mono">{systemInfo ? `${systemInfo.memory_used} / ${systemInfo.memory_total}` : "检测中..."}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-1">
                <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full" style={{ width: `${systemInfo?.memory_percent ?? 44}%` }} />
              </div>
            </div>
            {/* Model Name */}
            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800 mt-2">
              <span className="block text-[10px] text-indigo-400 font-bold mb-0.5">推理引擎模型</span>
              <span className="text-slate-100 font-mono font-medium truncate block" title={systemConfig?.llm_model || ""}>
                {systemConfig?.llm_model || "未设置 / 正在连接..."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed view status bulb */}
      {isCollapsed && (
        <div className="p-3 border-t border-slate-800 flex justify-center items-center shrink-0">
          <button 
            onClick={openSettings}
            className="h-6 w-6 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 flex items-center justify-center transition-colors focus:outline-none"
            title="系统设置"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* --- GLOBAL SETTINGS DIALOG (MODAL) --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh] animate-fade-in">
            {/* Header */}
            <div className="p-4.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Settings className="h-5 w-6 text-indigo-400" />
                系统配置
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded-lg transition-colors focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* MODULE 1: 大模型推理设置 (Top Module) */}
              <div className="space-y-4 font-sans text-xs">
                <div className="border-b border-slate-800 pb-1.5 flex items-center gap-1.5 text-indigo-400 font-bold text-[13px]">
                  <Cpu className="h-4 w-4" />
                  <span>大模型推理引擎设置 (LLM Configuration)</span>
                </div>

                {/* Row 1: LLM Provider selection */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    大模型提供商 (LLM Provider)
                  </label>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setProvider("ollama");
                        setBaseUrl("http://localhost:11434");
                      }}
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all focus:outline-none ${
                        provider === "ollama" 
                          ? "bg-indigo-600 text-white shadow-sm" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      本地私有大模型(Ollama)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProvider("openai");
                        setBaseUrl("https://api.deepseek.com/v1");
                        if (!model) setModel("deepseek-v4-pro");
                      }}
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all focus:outline-none ${
                        provider === "openai" 
                          ? "bg-indigo-600 text-white shadow-sm" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      云服务API (OpenAI 兼容)
                    </button>
                  </div>
                </div>

                {/* Row 2: API base URL */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    API 基础地址 (Base URL)
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={provider === "ollama" ? "http://localhost:11434" : "https://api.deepseek.com/v1"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Row 3: API Key (OpenAI compatible only) */}
                {provider === "openai" && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-400">
                      API 密钥 (API Key)
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="请输入云端密钥"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Row 4: Inference model name */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    推理模型名称 (Model Name)
                  </label>
                  {provider === "ollama" ? (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-sans text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">-- 请选择本地模型 --</option>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!ollamaModels.includes(model) && model && (
                        <option value={model}>{model} (当前自定义)</option>
                      )}
                    </select>
                  ) : (
                    <div className="flex gap-1.5">
                      <select
                        value={["deepseek-v4-pro", "deepseek-v4-flash", "gpt-4o", "gpt-3.5-turbo"].includes(model) ? model : "custom"}
                        onChange={(e) => {
                          if (e.target.value !== "custom") setModel(e.target.value);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-sans text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[150px] truncate cursor-pointer"
                      >
                        <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                        <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="custom">自定义输入</option>
                      </select>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="自定义代号"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {/* Row 5: Temperature slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-400">
                      生成温度创造力 (Temperature)
                    </label>
                    <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 font-bold shrink-0">精确 (0.0)</span>
                    <span className="text-[10px] text-slate-500 font-bold shrink-0">自由 (1.5)</span>
                  </div>
                </div>

                {/* Row 6: System Prompt customizer */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    全局系统核心提示词 (System Prompt)
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    placeholder="作为 AI 问答助手的引导性人设规则..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-sans text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed text-xs"
                  />
                </div>
              </div>

              {/* MODULE 2: 知识库切片参数设置 (Bottom Module) */}
              <div className="border-t border-slate-800 pt-5 space-y-4 font-sans text-xs">
                <div className="border-b border-slate-800 pb-1.5 flex items-center gap-1.5 text-indigo-400 font-bold text-[13px]">
                  <Sliders className="h-4 w-4" />
                  <span>知识库切片与检索设置 (RAG Configuration)</span>
                </div>

                {/* Row 1: Chunk Size */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    文档切片大小 (Chunk Size)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-indigo-500 pr-10"
                    />
                    <span className="absolute right-3 top-1.5 text-[10px] text-slate-500 font-bold">字</span>
                  </div>
                  <span className="text-[9px] text-slate-500 block leading-relaxed">每个分块的最大字数限制，推荐 400 ~ 800</span>
                </div>

                {/* Row 2: Chunk Overlap */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    相邻重叠长度 (Chunk Overlap)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-indigo-500 pr-10"
                    />
                    <span className="absolute right-3 top-1.5 text-[10px] text-slate-500 font-bold">字</span>
                  </div>
                  <span className="text-[9px] text-slate-500 block leading-relaxed">截断重叠字数（防止切段割裂句义，建议设为 10% 大小）</span>
                </div>

                {/* Row 3: Top K */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    召回分块总量 (Top K)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-indigo-500 pr-10"
                    />
                    <span className="absolute right-3 top-1.5 text-[10px] text-slate-500 font-bold">块</span>
                  </div>
                  <span className="text-[9px] text-slate-500 block leading-relaxed">每次问答喂给大模型的最大相关分块数</span>
                </div>

                {/* Row 4: Similarity threshold */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">
                    检索匹配阈值 (Similarity Score)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      min="0.0"
                      max="1.0"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-indigo-500 pr-12"
                    />
                    <span className="absolute right-3 top-1.5 text-[10px] text-slate-500 font-bold">Score</span>
                  </div>
                  <span className="text-[9px] text-slate-500 block leading-relaxed">低于该分数的向量召回将被过滤丢弃，防止无效噪点段落污染</span>
                </div>

                <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-[10px] text-indigo-400 leading-relaxed">
                  ⚙️ <strong>提示</strong>：修改分块（Size / Overlap）仅对**全新上传的物理文档**生效。已建立的数据库旧文档不会自动重塑（重塑旧文档需前往「知识库管理 ➔ 运维诊断」页触发全量重索引）。
                </div>
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2.5 bg-slate-950/10">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-all focus:outline-none"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="px-5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all flex items-center gap-1 focus:outline-none"
              >
                {isSaving ? "正在保存..." : "保存配置"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏内删除确认弹窗 */}
      {deleteConvConfirm && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeleteConvConfirm(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-5 max-w-[240px] w-full mx-3 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-slate-200 text-sm">删除后，该对话将不可恢复</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              由该对话生成的分享链接也将失效
            </p>
            <div className="flex justify-end gap-2.5 mt-4 pt-3 border-t border-slate-700">
              <button
                onClick={() => setDeleteConvConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-600 rounded-xl hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (deleteConvConfirm) deleteConversation(deleteConvConfirm.id);
                  setDeleteConvConfirm(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
