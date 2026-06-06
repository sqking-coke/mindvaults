"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { get, post, put, del } from "@/services/apiClient";
import type { Concept, ConceptDetail, ConceptUpdateRequest, ConceptManualCreateRequest } from "@/types/api";
import {
  Tag, Search, X, Edit3, Trash2, Plus, BookOpen, Loader2,
  ChevronLeft, ExternalLink, Hash, Clock, BadgeCheck, Sparkles,
} from "lucide-react";

// ── 状态徽章 ──────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: "自动抽取", color: "bg-blue-100 text-blue-700 border-blue-200" },
  confirmed: { label: "已确认", color: "bg-green-100 text-green-700 border-green-200" },
  edited: { label: "已编辑", color: "bg-amber-100 text-amber-700 border-amber-200" },
  manual: { label: "手动创建", color: "bg-violet-100 text-violet-700 border-violet-200" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] || STATUS_LABELS.auto;
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${info.color}`}>
      {info.label}
    </span>
  );
}

// ── 主组件 ──────────────────────────────────────────────

export default function ConceptPanel() {
  const { activeKbId, knowledgeBases, showToast } = usemindvaults();

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Detail view
  const [selectedConcept, setSelectedConcept] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<Concept | null>(null);
  const [editForm, setEditForm] = useState({ definition: "", summary: "", aliases: "", status: "" });

  // Create modal
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", definition: "", summary: "", aliases: "" });

  const PAGE_SIZE = 20;

  const fetchConcepts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      if (activeKbId) params.set("kb_id", activeKbId);
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);

      const data = await get<{ items: Concept[]; total: number }>(`/api/v1/kb/concepts?${params.toString()}`);
      setConcepts(data?.items || []);
      setTotal(data?.total || 0);
    } catch {
      setConcepts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, activeKbId, search, statusFilter]);

  useEffect(() => {
    fetchConcepts();
  }, [fetchConcepts]);

  // ── 查看详情 ──────────────────────────────────────────

  const openDetail = async (conceptId: number) => {
    setDetailLoading(true);
    try {
      const data = await get<ConceptDetail>(`/api/v1/kb/concepts/${conceptId}`);
      if (data) setSelectedConcept(data);
    } catch {
      showToast?.("加载概念详情失败", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  // ── 编辑 ──────────────────────────────────────────────

  const startEdit = (c: Concept) => {
    setEditing(c);
    setEditForm({
      definition: c.definition,
      summary: c.summary || "",
      aliases: (c.aliases || []).join(", "),
      status: c.status,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload: ConceptUpdateRequest = {};
    if (editForm.definition !== editing.definition) payload.definition = editForm.definition;
    if (editForm.summary !== (editing.summary || "")) payload.summary = editForm.summary;
    const newAliases = editForm.aliases.split(",").map(s => s.trim()).filter(Boolean);
    const oldAliases = editing.aliases || [];
    if (JSON.stringify(newAliases) !== JSON.stringify(oldAliases)) payload.aliases = newAliases;
    if (editForm.status !== editing.status) payload.status = editForm.status;

    if (Object.keys(payload).length === 0) { setEditing(null); return; }

    try {
      await put(`/api/v1/kb/concepts/${editing.id}`, payload);
      showToast?.("概念已更新", "success");
      setEditing(null);
      fetchConcepts();
    } catch {
      showToast?.("更新失败", "error");
    }
  };

  // ── 删除 ──────────────────────────────────────────────

  const deleteConcept = async (conceptId: number, name: string) => {
    if (!window.confirm(`确认删除概念「${name}」？关联的 chunk 引用将一并移除。`)) return;
    try {
      await del<unknown>(`/api/v1/kb/concepts/${conceptId}`);
      showToast?.("概念已删除", "success");
      if (selectedConcept?.id === conceptId) setSelectedConcept(null);
      fetchConcepts();
    } catch {
      showToast?.("删除失败", "error");
    }
  };

  // ── 手动创建 ──────────────────────────────────────────

  const createConcept = async () => {
    if (!createForm.name.trim() || !createForm.definition.trim()) return;
    if (!activeKbId) { showToast?.("请先选择知识库", "error"); return; }

    const payload: ConceptManualCreateRequest = {
      kb_id: Number(activeKbId),
      name: createForm.name.trim(),
      definition: createForm.definition.trim(),
      summary: createForm.summary.trim() || undefined,
      aliases: createForm.aliases.split(",").map(s => s.trim()).filter(Boolean),
      status: "manual",
    };

    try {
      await post("/api/v1/kb/concepts", payload);
      showToast?.("概念已创建", "success");
      setCreating(false);
      setCreateForm({ name: "", definition: "", summary: "", aliases: "" });
      fetchConcepts();
    } catch {
      showToast?.("创建失败", "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── 详情视图 ──────────────────────────────────────────

  if (selectedConcept) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => setSelectedConcept(null)}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mb-4 font-medium transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          返回概念列表
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-slate-800">{selectedConcept.name}</h2>
                <StatusBadge status={selectedConcept.status} />
              </div>
              {selectedConcept.aliases && selectedConcept.aliases.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Hash className="h-3 w-3 text-slate-400" />
                  <span className="text-xs text-slate-500">{selectedConcept.aliases.join(", ")}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startEdit(selectedConcept)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                title="编辑"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => deleteConcept(selectedConcept.id, selectedConcept.name)}
                className="p-2 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 transition-colors"
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="prose prose-sm max-w-none mb-6">
            <p className="text-sm text-slate-600 leading-relaxed">{selectedConcept.definition}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6 text-xs">
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-slate-400">置信度</span>
              <p className="font-semibold text-slate-700 mt-0.5">{(selectedConcept.confidence * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-slate-400">引用次数</span>
              <p className="font-semibold text-slate-700 mt-0.5">{selectedConcept.chunk_count} 个 chunk</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-slate-400">更新时间</span>
              <p className="font-semibold text-slate-700 mt-0.5">{new Date(selectedConcept.updated_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* 相关概念 */}
          {selectedConcept.related_concepts.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                相关概念
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedConcept.related_concepts.map(name => (
                  <span key={name} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 引用 Chunk 列表 */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" />
              引用文档片段 ({selectedConcept.chunks.length})
            </h3>
            <div className="space-y-2">
              {selectedConcept.chunks.map(ch => (
                <div key={ch.chunk_id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[70%]">{ch.doc_name}</span>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      {ch.page && <span>p.{ch.page}</span>}
                      <span>相关度 {ch.relevance.toFixed(2)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{ch.content_preview}...</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 编辑弹窗 */}
        {editing && (
          <EditModal
            concept={editing}
            form={editForm}
            onChange={setEditForm}
            onSave={saveEdit}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    );
  }

  // ── 列表视图 ──────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索概念名称..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">全部状态</option>
          <option value="auto">自动抽取</option>
          <option value="confirmed">已确认</option>
          <option value="edited">已编辑</option>
          <option value="manual">手动创建</option>
        </select>

        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          手动创建
        </button>
      </div>

      {/* 概念表格 */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
          </div>
        ) : concepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 select-none">
            <Tag className="h-12 w-12 mb-4 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500 mb-1">
              {search ? "未找到匹配的概念" : "暂无概念"}
            </p>
            <p className="text-xs text-slate-400 max-w-xs text-center leading-relaxed">
              {search
                ? "尝试其他搜索词，或清除筛选条件"
                : "上传文档后，系统将自动从内容中抽取术语概念。你也可以手动创建。"
              }
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">术语</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">摘要</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">状态</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">引用</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {concepts.map(c => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => openDetail(c.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 hover:text-indigo-600 transition-colors">
                          {c.name}
                        </span>
                      </div>
                      {c.aliases && c.aliases.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-0.5 ml-5.5">别名: {c.aliases.slice(0, 3).join(", ")}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <p className="text-xs text-slate-500 line-clamp-2 max-w-xs">{c.summary || c.definition.slice(0, 80)}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      {c.doc_names && c.doc_names.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {c.doc_names.slice(0, 2).map((doc, i) => (
                            <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[180px]" title={doc}>
                              {doc.length > 18 ? doc.slice(0, 18) + "..." : doc}
                            </span>
                          ))}
                          {c.doc_names.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{c.doc_names.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{c.chunk_count} 个 chunk</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => startEdit(c)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                          title="编辑"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteConcept(c.id, c.name)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">共 {total} 个概念</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-slate-500 px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 创建弹窗 */}
      {creating && (
        <CreateModal
          form={createForm}
          onChange={setCreateForm}
          onSave={createConcept}
          onClose={() => setCreating(false)}
        />
      )}

      {/* 编辑弹窗 */}
      {editing && !selectedConcept && (
        <EditModal
          concept={editing}
          form={editForm}
          onChange={setEditForm}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── 编辑弹窗 ──────────────────────────────────────────────

function EditModal({
  concept, form, onChange, onSave, onClose,
}: {
  concept: Concept;
  form: { definition: string; summary: string; aliases: string; status: string };
  onChange: (f: typeof form) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-4">编辑「{concept.name}」</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">定义</label>
            <textarea
              value={form.definition}
              onChange={e => onChange({ ...form, definition: e.target.value })}
              rows={5}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">摘要</label>
            <textarea
              value={form.summary}
              onChange={e => onChange({ ...form, summary: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">别名（逗号分隔）</label>
            <input
              type="text"
              value={form.aliases}
              onChange={e => onChange({ ...form, aliases: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">状态</label>
            <select
              value={form.status}
              onChange={e => onChange({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="auto">自动抽取</option>
              <option value="confirmed">已确认</option>
              <option value="edited">已编辑</option>
              <option value="manual">手动创建</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button onClick={onSave} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 创建弹窗 ──────────────────────────────────────────────

function CreateModal({
  form, onChange, onSave, onClose,
}: {
  form: { name: string; definition: string; summary: string; aliases: string };
  onChange: (f: typeof form) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-4">手动创建概念</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">术语名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => onChange({ ...form, name: e.target.value })}
              placeholder="如：质心向量匹配"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">定义 *</label>
            <textarea
              value={form.definition}
              onChange={e => onChange({ ...form, definition: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">摘要</label>
            <textarea
              value={form.summary}
              onChange={e => onChange({ ...form, summary: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">别名（逗号分隔）</label>
            <input
              type="text"
              value={form.aliases}
              onChange={e => onChange({ ...form, aliases: e.target.value })}
              placeholder="如：centroid matching, KB 质心"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button
            onClick={onSave}
            disabled={!form.name.trim() || !form.definition.trim()}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
