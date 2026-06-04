"use client";

import React, { useState } from "react";
import KBDashboard from "@/components/kb/KBDashboard";
import DocumentTable from "@/components/kb/DocumentTable";
import UploadZone from "@/components/kb/UploadZone";
import RetrievalSandbox from "@/components/kb/RetrievalSandbox";
import VaultImportDialog from "@/components/kb/VaultImportDialog";
import SystemKBHome from "@/components/kb/SystemKBHome";
import { usemindvaults } from "@/context/mindvaultsContext";
import { 
  Database, 
  ArrowLeft, 
  FileText, 
  Search, 
  AlertCircle,
  FolderOpen
} from "lucide-react";

export default function KBPage() {
  const {
    knowledgeBases,
    activeKbId,
    setActiveKbId,
    isKbLoading,
    isDemo,
  } = usemindvaults();

  // Navigation states
  const [kbTab, setKbTab] = useState<"docs" | "test">("docs");
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "info" | "success" | "error" | "warning" }[]>([]);

  const showToast = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Find active KB
  const activeKb = knowledgeBases.find(kb => String(kb.id) === activeKbId);

  return (
    <>
      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Loading */}
        {isKbLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-slate-400 text-sm animate-pulse">加载中...</div>
          </div>
        ) : activeKbId && activeKb ? (
          activeKb.id === 1 ? (
            /* 系统库专用首页 */
            <SystemKBHome />
          ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Header with back button */}
            <header className="h-16 border-b border-slate-200 bg-white pl-16 pr-6 md:px-6 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-4 overflow-hidden">
                <button
                  onClick={() => setActiveKbId(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div className="h-4 w-[1px] bg-slate-200" />
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-500 shrink-0" />
                    <h1 className="font-bold text-slate-800 text-sm truncate">{activeKb.name}</h1>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5 max-w-[300px] md:max-w-md">
                    {activeKb.description}
                  </p>
                </div>
              </div>

              {/* Tab Selector */}
              <div role="tablist" aria-label="知识库子页面" className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  id="kb-tab-docs"
                  role="tab"
                  aria-selected={kbTab === "docs"}
                  aria-controls="kb-tab-docs-content"
                  onClick={() => setKbTab("docs")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                    kbTab === "docs" 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  文档管理
                </button>
                <button
                  id="kb-tab-test"
                  role="tab"
                  aria-selected={kbTab === "test"}
                  aria-controls="kb-tab-test-content"
                  onClick={() => setKbTab("test")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                    kbTab === "test" 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  检索测试
                </button>
              </div>
            </header>

            {/* Sub-tab 1: Document Management */}
            {kbTab === "docs" && (
              <div id="kb-tab-docs-content" role="tabpanel" aria-labelledby="kb-tab-docs" className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-full flex flex-col justify-center">
                      <UploadZone showToast={showToast} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 shadow-sm">
                        <FolderOpen className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">
                          批量导入 Obsidian Vault
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          直接扫描本地 Obsidian Markdown 文件夹并批量一键导入，系统将自动进行 YAML 元数据解析及内链 Wiki 转换。
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isDemo) {
                          showToast("演示环境不支持导入 Obsidian Vault，请自部署后体验完整功能", "warning");
                          return;
                        }
                        setIsImportOpen(true);
                      }}
                      className="mt-4 w-full py-2.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 hover:text-violet-700 rounded-xl text-xs font-semibold text-violet-600 transition-all focus:outline-none flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <FolderOpen className="h-4 w-4" />
                      立即导入 Obsidian Vault
                    </button>
                  </div>
                </div>
                <DocumentTable />
              </div>
            )}

            {/* Sub-tab 2: Retrieval Testing Playground */}
            {kbTab === "test" && (
              <RetrievalSandbox />
            )}

          </div>
          )
        ) : (
          /* State 2: KB List Overview (No active KB selected) */
          <KBDashboard />
        )}

      </div>

      {/* Vault Import Dialog Modal */}
      <VaultImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        showToast={showToast}
      />

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-xl border text-sm transition-all duration-350 transform translate-y-0 bg-white/95 backdrop-blur-md border-indigo-150 text-slate-800 shadow-slate-200/80 animate-fade-in-up"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-xs">{toast.type === "success" ? "操作成功" : toast.type === "warning" ? "提示" : "信息"}</p>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 font-semibold text-xs ml-1 transition-colors focus:outline-none"
              aria-label="关闭提示"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
