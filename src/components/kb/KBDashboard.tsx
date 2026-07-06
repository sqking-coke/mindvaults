"use client";

import React, { useState, useEffect, useRef } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { formatDateShort } from "@/utils/date";
import {
  Database,
  Plus,
  Trash2,
  FilePlus,
  Clock
} from "lucide-react";

export default function KBDashboard() {
  const {
    knowledgeBases,
    setActiveKbId,
    addKnowledgeBase,
    deleteKnowledgeBase,
    isDemo,
    showToast,
  } = usemindvaults();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDesc, setNewKbDesc] = useState("");
  const [deleteKbConfirm, setDeleteKbConfirm] = useState<{ id: string; name: string } | null>(null);

  const newKbInputRef = useRef<HTMLInputElement>(null);

  // Focus the input field when the create form is shown
  useEffect(() => {
    if (showCreateForm) {
      newKbInputRef.current?.focus();
    }
  }, [showCreateForm]);

  const handleCreateKb = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("演示环境不支持新建知识库，请自部署后体验完整功能", "warning");
      return;
    }
    if (!newKbName.trim()) return;
    addKnowledgeBase(newKbName.trim(), newKbDesc.trim());
    setNewKbName("");
    setNewKbDesc("");
    setShowCreateForm(false);
  };

  const handleDeleteKb = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemo) {
      showToast("演示环境不支持删除知识库，请自部署后体验完整功能", "warning");
      return;
    }
    setDeleteKbConfirm({ id, name });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-5.5 w-5.5 text-indigo-500" />
            本地知识管理中心
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            在这里创建、配置或删除本地物理知识库。挂载文档后，系统将自动进行高精度大纲分析及向量切片化。
          </p>
        </div>

        <button
          onClick={() => {
            if (isDemo) {
              showToast("演示环境不支持新建知识库，请自部署后体验完整功能", "warning");
              return;
            }
            setShowCreateForm(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl shadow-md shadow-indigo-600/10 text-xs transition-all flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          新建知识库
        </button>
      </header>

      {/* Inline Modal/Form for creating a new Knowledge Base */}
      {showCreateForm && (
        <form 
          onSubmit={handleCreateKb}
          role="form"
          aria-label="新建物理知识库挂载点"
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md space-y-4 animate-fade-in select-none max-w-xl"
        >
          <h3 id="kb-form-title" className="font-bold text-slate-800 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <FilePlus className="h-4.5 w-4.5 text-indigo-500" />
            建立本地物理知识库挂载点
          </h3>
          
          <div className="grid grid-cols-1 gap-3.5 text-xs">
            <div className="space-y-1">
              <label htmlFor="kb-form-name-input" className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">知识库名称</label>
              <input
                id="kb-form-name-input"
                ref={newKbInputRef}
                type="text"
                required
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
                placeholder="例如：公司审计报告汇总 2026"
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-150 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
            
            <div className="space-y-1">
              <label htmlFor="kb-form-desc-input" className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">描述信息</label>
              <textarea
                id="kb-form-desc-input"
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
                placeholder="简要概括此知识库主要挂载的文档属性及检索目的（选填）..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-150 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-semibold"
            >
              取消
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/10"
            >
              确定创建
            </button>
          </div>
        </form>
      )}

      {/* Knowledge Bases Cards Grid list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 select-none">
        {knowledgeBases.length === 0 ? (
          <div className="col-span-full text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
            <Database className="h-12 w-12 text-slate-200 mx-auto animate-pulse" />
            <p className="text-sm font-semibold text-slate-600">当前没有配置任何物理知识库目录</p>
            <button
              onClick={() => {
                if (isDemo) {
                  showToast("演示环境不支持新建知识库，请自部署后体验完整功能", "warning");
                  return;
                }
                setShowCreateForm(true);
              }}
              className="text-xs bg-indigo-50 text-indigo-600 font-bold border border-indigo-150 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors inline-block"
            >
              立即创建首个挂载点
            </button>
          </div>
        ) : (
          knowledgeBases.map((kb) => {
            return (
              <div
                key={kb.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveKbId(String(kb.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveKbId(String(kb.id));
                  }
                }}
                aria-label={`进入知识库: ${kb.name}`}
                className="bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/5 cursor-pointer p-5 rounded-2xl flex flex-col justify-between h-52 transition-all duration-200 group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                {/* Top Content */}
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white shadow-sm transition-all duration-200">
                      <Database className="h-5 w-5" />
                    </div>
                      <button
                        onClick={(e) => handleDeleteKb(String(kb.id), kb.name, e)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all focus:outline-none focus:ring-2 focus:ring-red-400"
                        title="删除此知识库挂载"
                        aria-label={`删除知识库: ${kb.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                  </div>
                  
                  <h3 className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors">
                    {kb.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mt-1">
                    {kb.description || "无描述信息。"}
                  </p>
                </div>

                {/* Bottom stats details */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <div className="flex items-center gap-3">
                    <span className="flex flex-col">
                      <b className="text-slate-800 font-semibold font-mono text-xs">{kb.doc_count}</b>
                      <span>关联文档</span>
                    </span>
                    <span className="h-5 w-[1px] bg-slate-100" />
                    <span className="flex flex-col">
                      <b className="text-slate-800 font-semibold font-mono text-xs">
                        {kb.char_count > 0
                          ? (kb.char_count > 10000 ? `${(kb.char_count / 10000).toFixed(1)}w` : kb.char_count.toLocaleString())
                          : kb.doc_count > 0
                            ? <span className="text-amber-500 text-[10px]">解析中...</span>
                            : "0"}
                      </b>
                      <span>提取字符</span>
                    </span>
                  </div>
                  
                  <span className="text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateShort(kb.created_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={!!deleteKbConfirm}
        onClose={() => setDeleteKbConfirm(null)}
        onConfirm={() => deleteKbConfirm && deleteKnowledgeBase(deleteKbConfirm.id)}
        title="确认删除知识库"
        message={<>将永久删除知识库 <b className="text-slate-700">{deleteKbConfirm?.name}</b> 及其中的所有文档文件，该操作不可恢复。</>}
      />
    </div>
  );
}
