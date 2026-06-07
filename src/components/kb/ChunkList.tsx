"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchDocChunks, updateChunk, deleteChunk, type ChunkItem } from "@/services/ragService";
import { formatDateShort } from "@/utils/date";
import { Edit3, Trash2, ChevronLeft, ChevronRight, Hash, Eye, AlertTriangle } from "lucide-react";
import ChunkEditor from "./ChunkEditor";

function ChunkStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: "活跃",   cls: "bg-emerald-100 text-emerald-700" },
    superseded: { label: "已替换", cls: "bg-amber-100 text-amber-700" },
    archived:   { label: "已归档", cls: "bg-slate-200 text-slate-500" },
    orphan:     { label: "孤岛",   cls: "bg-red-100 text-red-500" },
  };
  const info = map[status] || { label: status, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${info.cls}`}>
      {info.label}
    </span>
  );
}

interface ChunkListProps {
  docId: string;
  docName: string;
  onCountChanged?: () => void;
}

export default function ChunkList({ docId, docName, onCountChanged }: ChunkListProps) {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chunk editing state
  const [editingChunk, setEditingChunk] = useState<ChunkItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const loadChunks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docIdNum = Number(docId);
      if (isNaN(docIdNum)) {
        throw new Error("无效的文档 ID");
      }
      const data = await fetchDocChunks(docIdNum, page, pageSize);
      setChunks(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取切片数据失败");
    } finally {
      setIsLoading(false);
    }
  }, [docId, page, pageSize]);

  useEffect(() => {
    loadChunks();
  }, [loadChunks]);

  const handleEdit = (chunk: ChunkItem) => {
    setEditingChunk(chunk);
    setIsEditorOpen(true);
  };

  const handleSaveChunk = async (chunkId: number, content: string) => {
    await updateChunk(chunkId, content);
    // Reload local chunks
    loadChunks();
  };

  const handleDelete = async (chunkId: number) => {
    if (!confirm("确定要删除此知识切片吗？这会立即将其从 pgvector 向量索引中移除。")) {
      return;
    }
    try {
      await deleteChunk(chunkId);
      loadChunks();
      if (onCountChanged) {
        onCountChanged();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除切片失败");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 space-y-3.5 select-none font-sans">
      <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
        <div className="flex items-center gap-1.5">
          <Hash className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">
            切片管理 — 《{docName}》 ({total} 个切片)
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          第 {page} / {Math.max(1, totalPages)} 页
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
          <svg className="animate-spin h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-semibold">正在载入物理切片...</span>
        </div>
      ) : error ? (
        <div className="text-center py-10 text-red-500 text-xs flex flex-col items-center gap-1.5">
          <AlertTriangle className="h-6 w-6 text-red-400" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : chunks.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-xs leading-relaxed">
          此文档暂无可见切片，可能正在解析或重索引中。
        </div>
      ) : (
        <>
          <div className="overflow-hidden border border-slate-150 rounded-lg bg-white shadow-sm">
            <table className="w-full text-left border-collapse font-sans text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold">
                  <th className="px-4 py-2.5 w-12 text-center">索引</th>
                  <th className="px-4 py-2.5">切片内容预览 (前 150 字符)</th>
                  <th className="px-4 py-2.5 w-16 text-center">页码</th>
                  <th className="px-4 py-2.5 w-16 text-center">状态</th>
                  <th className="px-4 py-2.5 w-24 text-center">创建时间</th>
                  <th className="px-4 py-2.5 w-24 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {chunks.map((chunk, index) => {
                  const globalIndex = (page - 1) * pageSize + index;
                  return (
                    <tr key={chunk.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-center font-mono text-slate-400">
                        {globalIndex}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 font-sans max-w-[400px] truncate leading-relaxed">
                        {chunk.content}
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold font-mono text-indigo-600 bg-indigo-50/20">
                        {chunk.page !== null ? `${chunk.page} 页` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <ChunkStatusBadge status={chunk.status} />
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-slate-400">
                        {formatDateShort(chunk.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(chunk)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-150 rounded-md transition-colors"
                            title="编辑并重新召回向量"
                          >
                            <Edit3 className="h-3 w-3" />
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(chunk.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-150 rounded-md transition-colors"
                            title="立即物理删除切片"
                          >
                            <Trash2 className="h-3 w-3" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1 select-none">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:hover:bg-transparent transition-colors focus:outline-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                上一页
              </button>
              <div className="text-[11px] text-slate-500 font-medium">
                第 <span className="font-bold text-slate-700">{page}</span> 页 / 共 <span className="font-semibold">{totalPages}</span> 页
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:hover:bg-transparent transition-colors focus:outline-none"
              >
                下一页
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Chunk Editor Modal */}
      <ChunkEditor
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingChunk(null);
        }}
        chunk={
          editingChunk
            ? {
                id: editingChunk.id,
                content: editingChunk.content,
                page: editingChunk.page,
                chunk_index: chunks.findIndex((c) => c.id === editingChunk.id) !== -1 
                  ? (page - 1) * pageSize + chunks.findIndex((c) => c.id === editingChunk.id)
                  : editingChunk.id,
              }
            : null
        }
        onSave={handleSaveChunk}
      />
    </div>
  );
}