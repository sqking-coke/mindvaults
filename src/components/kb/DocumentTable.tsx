"use client";

import React, { useState } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import type { DocumentRecord } from "@/types/api";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import {
  FileText,
  Clock,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Sliders,
  Database
} from "lucide-react";
import ChunkList from "./ChunkList";

interface DocumentTableProps {
  opsMode?: boolean;
  opsDocuments?: DocumentRecord[];  // ops 模式外部传入的文档列表
}

export default function DocumentTable({ opsMode = false, opsDocuments }: DocumentTableProps) {
  const {
    documents,
    activeKbId,
    reindexDocument,
    toggleDocumentStatus,
    deleteDocument,
    isDemo,
  } = usemindvaults();

  // Filter docs for active KB — ops 模式优先使用外部传入的列表
  const activeKbDocs = opsDocuments
    ? opsDocuments
    : opsMode
      ? documents
      : documents.filter(doc => doc.kbId === activeKbId);

  // State to track expanded document for viewing/managing chunks
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const handlePreview = async (docId: string, docName: string) => {
    setPreviewLoading(true);
    setPreviewDoc({ name: docName, content: "" });
    try {
      const res = await fetch(`${API_BASE}/api/v1/kb/documents/${docId}/content`);
      const json = await res.json();
      if (json.code === 0 && json.data) {
        setPreviewDoc({ name: json.data.doc_name, content: json.data.content });
      }
    } catch {
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleToggleStatus = async (docId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "disabled" ? "enabled" : "disabled";
    try {
      await toggleDocumentStatus(docId, nextStatus);
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新文档状态失败");
    }
  };

  const handleReindex = async (docId: string, docName: string) => {
    if (confirm(`确定要重新索引《${docName}》吗？这会清除该文档的所有旧切片与向量缓存，并重新分词切片摄入。`)) {
      try {
        await reindexDocument(docId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "重索引提交失败");
      }
    }
  };

  const handleToggleExpand = (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
    } else {
      setExpandedDocId(docId);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm font-sans">
      <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between select-none">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
          {opsMode ? (
            <Sliders className="h-4.5 w-4.5 text-indigo-500" />
          ) : (
            <FileText className="h-4.5 w-4.5 text-indigo-500" />
          )}
          {opsMode ? "知识库运维文档管理" : "当前文档库"} ({activeKbDocs.length} 个文件)
        </h3>
        <div className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 font-bold uppercase">
          {opsMode ? "运维控制中心就绪" : "向量引擎在线"}
        </div>
      </div>

      <div className="overflow-x-auto">
        {activeKbDocs.length === 0 ? (
          <div className="text-center py-12 text-slate-400 select-none space-y-2">
            <FileText className="h-10 w-10 text-slate-300 mx-auto animate-pulse-subtle" />
            <p className="text-xs font-semibold">此知识库中暂未关联任何物理文档</p>
            <p className="text-[11px] max-w-xs mx-auto text-slate-400">
              请在上方拖放或快捷添加模拟文档，让本地 Parser 完成文本高保真提取。
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-semibold select-none">
                <th className="px-6 py-3.5">文档名称</th>
                <th className="px-6 py-3.5">物理大小</th>
                <th className="px-6 py-3.5">{opsMode ? "切片数量" : "解析字符数"}</th>
                <th className="px-6 py-3.5">当前状态</th>
                <th className="px-6 py-3.5">上传时间</th>
                <th className="px-6 py-3.5 text-right">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeKbDocs.map((doc) => {
                const isExpanded = expandedDocId === doc.id;
                
                // Parse Obsidian metadata if available
                let isObsidian = false;
                let obsidianTitle = "";
                if (doc.description) {
                  try {
                    const parsed = JSON.parse(doc.description);
                    if (parsed && parsed.source === "obsidian") {
                      isObsidian = true;
                      obsidianTitle = parsed.frontmatter?.title || "";
                    }
                  } catch (e) {
                    // Ignore parsing error
                  }
                }

                return (
                  <React.Fragment key={doc.id}>
                    <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? "bg-slate-50/30 font-medium" : ""}`}>
                      <td className="px-6 py-4 font-medium text-slate-800 max-w-[240px] truncate">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                            onClick={(e) => { e.stopPropagation(); handlePreview(doc.id, doc.name); }}
                            className="truncate text-left hover:text-indigo-600 transition-colors focus:outline-none"
                            title="点击预览原文"
                          >
                            {doc.name}
                          </button>
                              {isObsidian && (
                                <span className="shrink-0 text-[9px] font-bold text-violet-600 bg-violet-50 border border-violet-150 px-1 py-0.2 rounded" title="Obsidian Vault 导入">
                                  Obsidian
                                </span>
                              )}
                            </div>
                            {isObsidian && obsidianTitle && (
                              <span className="text-[10px] text-slate-400 truncate mt-0.5" title={obsidianTitle}>
                                {obsidianTitle}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono select-all">{doc.size}</td>
                      <td className="px-6 py-4 text-slate-600 font-mono font-medium">
                        {doc.status === "success" || doc.status === "disabled" 
                          ? (opsMode ? `${doc.chunkCount} 个切片` : `${doc.chars.toLocaleString()} 字符`) 
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {doc.status === "uploading" && (
                          <div className="flex flex-col w-28 space-y-1 select-none">
                            <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400 animate-spin" />
                              正在物理上传 {doc.progress}%
                            </span>
                            <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                              <div className="bg-indigo-600 h-full transition-all duration-150" style={{ width: `${doc.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {doc.status === "parsing" && (
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50/50 px-2.5 py-0.5 rounded-full border border-indigo-100 select-none">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            大纲拆解中...
                          </div>
                        )}
                        {doc.status === "success" && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-150 select-none">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            高保真已启用
                          </div>
                        )}
                        {doc.status === "disabled" && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 select-none">
                            <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                            已人工禁用
                          </div>
                        )}
                        {doc.status === "failed" && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-150 select-none" title="格式不支持或文本过长损坏">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                            解析失败
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono">{doc.uploadedAt}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Ops Actions: Enable/Disable, Reindex */}
                          {opsMode && (doc.status === "success" || doc.status === "disabled") && (
                            <>
                              {/* Toggle visibility */}
                              <button
                                onClick={() => handleToggleStatus(doc.id, doc.status)}
                                className={`p-1.5 rounded-lg border text-xs font-semibold transition-all focus:outline-none ${
                                  doc.status === "disabled"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
                                title={doc.status === "disabled" ? "启用该文档，使其能够被对话召回" : "禁用该文档，使其暂时不参与召回"}
                              >
                                {doc.status === "disabled" ? (
                                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />启用</span>
                                ) : (
                                  <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" />禁用</span>
                                )}
                              </button>

                              {/* Trigger Manual Reindex */}
                              <button
                                onClick={() => handleReindex(doc.id, doc.name)}
                                className="p-1.5 rounded-lg border bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border-slate-200 hover:border-indigo-150 text-xs font-semibold transition-all focus:outline-none"
                                title="手动重索引该文档"
                              >
                                <span className="flex items-center gap-1">
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  重索引
                                </span>
                              </button>
                            </>
                          )}

                          {/* Expanded view trigger for chunks — available in both normal and ops modes */}
                          {(doc.status === "success" || doc.status === "disabled") && (
                            <button
                              onClick={() => handleToggleExpand(doc.id)}
                              className={`p-1.5 rounded-lg border text-xs font-semibold transition-all focus:outline-none ${
                                isExpanded
                                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-150 hover:bg-indigo-100"
                              }`}
                              title="查看并管理所有物理切片"
                            >
                              <span className="flex items-center gap-1">
                                <Database className="h-3.5 w-3.5" />
                                {isExpanded ? "收起切片" : "查看切片"}
                              </span>
                            </button>
                          )}

                          {/* Original Reparse Action */}
                          {!opsMode && doc.status !== "uploading" && (
                            <button
                              onClick={() => handleReindex(doc.id, doc.name)}
                              disabled={doc.status === "parsing"}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              title="重新解析此文件并重构向量树"
                              aria-label={`重新解析文件: ${doc.name}`}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${doc.status === "parsing" ? "animate-spin" : ""}`} />
                            </button>
                          )}

                          {/* 删除文档 — demo 模式隐藏 */}
                          {!isDemo && (
                            <button
                              onClick={() => setDeleteConfirm({ id: doc.id, name: doc.name })}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                              title="删除文档及所有切片（不可恢复）"
                              aria-label={`删除文件: ${doc.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Collapsible Section for ChunkList — available in both normal and ops modes */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-slate-50/20 border-t border-b border-slate-150">
                          <ChunkList 
                            docId={doc.id} 
                            docName={doc.name} 
                            onCountChanged={() => {
                              // We can trigger parent or context update if needed
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 原文预览弹窗 */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-sm truncate pr-4">{previewDoc.name}</h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-xs">加载中...</span>
                </div>
              ) : (
                <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans select-text">
                  {previewDoc.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteDocument(deleteConfirm!.id)}
        title="确认删除文档"
        message={<>将永久删除 <b className="text-slate-700">{deleteConfirm?.name}</b> 及其所有切片数据，删除后不可恢复。</>}
      />
    </div>
  );
}