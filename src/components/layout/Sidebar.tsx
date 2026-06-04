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
  ChevronLeft,
  Menu,
  Wrench,
  BarChart3,
  Settings,
  Sliders,
  MoreHorizontal,
  Pin,
  PinOff,
  Sparkles
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
    setActiveKbId,
  } = usemindvaults();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

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

  // 获取系统信息（Demo 模式直接展示预设配置）
  useEffect(() => {
    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    if (isDemo) {
      setSystemInfo({
        cpu_name: "Apple M4 Ultra",
        cpu_cores_logical: 32,
        cpu_cores_physical: 24,
        memory_total: "256 GB",
        memory_used: "58.3 GB",
        memory_percent: 22.8,
      });
      return;
    }
    fetchSystemInfo().then(setSystemInfo).catch(() => {});
  }, []);

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
  const isManageActive = pathname.startsWith("/kb/manage");
  const isKbActive = pathname === "/kb" || (pathname.startsWith("/kb") && !isOpsActive && !isStatsActive && !isManageActive);

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
        <div className={`flex border-b border-slate-800 select-none shrink-0 ${isCollapsed ? "flex-col items-center py-3 gap-2 h-auto" : "h-16 items-center justify-between px-4"}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="mindvaults" width={36} height={36} className="h-9 w-9 rounded-xl shadow-lg shadow-indigo-500/20" />
            <div>
              <span className="font-bold text-base bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">mindvaults</span>
              <span className="block text-[10px] text-indigo-400 font-medium tracking-wider">v0.4.0</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <img src="/logo.svg" alt="mindvaults" width={28} height={28} className="h-7 w-7 rounded-lg" />
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
            isChatActive
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
          }`}
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>对话沙盒 (Chat)</span>}
        </Link>
        <Link
          href="/kb"
          onClick={() => { setMobileOpen(false); setActiveKbId(null); }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
            isKbActive
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
          }`}
        >
          <Database className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>知识中心 (KB)</span>}
        </Link>
        <Link
          href="/kb/ops"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
            isOpsActive
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
          }`}
        >
          <Wrench className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>运维管理 (Ops)</span>}
        </Link>
        <Link
          href="/kb/stats"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
            isStatsActive
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
          }`}
        >
          <BarChart3 className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>问答统计 (Stats)</span>}
        </Link>
        <Link
          href="/kb/manage"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
            isManageActive
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
          }`}
        >
          <Sparkles className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>数据治理 (Gov)</span>}
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
      {(isKbActive || isOpsActive || isStatsActive || isManageActive) && !isCollapsed && (
        <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 border-t border-slate-800/60 text-center select-none text-slate-600">
          {isOpsActive ? (
            <Wrench className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          ) : isStatsActive ? (
            <BarChart3 className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          ) : isManageActive ? (
            <Sparkles className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          ) : (
            <Database className="h-10 w-10 text-slate-700 mb-3 animate-pulse-subtle" />
          )}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            {isOpsActive ? "运维管理中" : isStatsActive ? "问答统计中" : isManageActive ? "数据治理中" : "知识管理中"}
          </p>
          <p className="text-[11px] leading-relaxed max-w-[180px]">
            {isOpsActive
              ? "对知识库分流切片及文档检索状态进行高级维护。"
              : isStatsActive
                ? "多维度分析用户提问倾向，持续优化检索。"
                : isManageActive
                  ? "审核对话提炼知识点，管理概念关联，监控知识库健康度。"
                  : "在右侧视图中切换或建立新的本地知识库文件。"}
          </p>
        </div>
      )}

      {/* System Diagnostics / Metrics Dashboard — mt-auto pushes to bottom */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0 select-none mt-auto">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              本地系统状态
            </span>
            <button
              onClick={() => router.push("/settings")}
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
                <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full" style={{ width: `${systemInfo?.memory_percent || 0}%` }} />
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
            onClick={() => router.push("/settings")}
            className="h-6 w-6 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 flex items-center justify-center transition-colors focus:outline-none"
            title="系统设置"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Settings moved to dedicated /settings page */}

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
