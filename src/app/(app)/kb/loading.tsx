"use client";

import React from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { 
  Database, 
  ArrowLeft, 
  FileText, 
  Search,
  Upload
} from "lucide-react";

export default function KBLoading() {
  const { 
    knowledgeBases, 
    activeKbId 
  } = usemindvaults();

  const activeKb = knowledgeBases.find(kb => String(kb.id) === activeKbId);

  return (
    <>
      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {activeKbId && activeKb ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Header with back button */}
            <header className="h-16 border-b border-slate-200 bg-white pl-16 pr-6 md:px-6 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-4 overflow-hidden">
                <button
                  disabled
                  className="p-1.5 opacity-50 cursor-not-allowed rounded-lg text-slate-500"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div className="h-4 w-[1px] bg-slate-200" />
                <div className="overflow-hidden animate-pulse">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                  </div>
                  <div className="h-3 w-48 bg-slate-100 rounded mt-1.5" />
                </div>
              </div>

              {/* Tab Selector Skeleton */}
              <div role="tablist" aria-label="知识库子页面" className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 select-none">
                <button
                  disabled
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-sm flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  文档管理
                </button>
                <button
                  disabled
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 flex items-center gap-1.5"
                >
                  <Search className="h-3.5 w-3.5" />
                  检索测试
                </button>
              </div>
            </header>

            {/* Document Tab Content Skeleton */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {/* Upload Zone Skeleton */}
              <div className="border-2 border-dashed border-slate-200 bg-white rounded-2xl p-8 text-center select-none flex flex-col items-center justify-center space-y-3 animate-pulse">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 shadow-sm">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="h-4 w-48 bg-slate-200 rounded mx-auto" />
                  <div className="h-3 w-64 bg-slate-100 rounded mx-auto" />
                </div>
              </div>

              {/* Document Table Skeleton */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between select-none">
                  <div className="h-4.5 w-36 bg-slate-200 rounded" />
                  <div className="h-5 w-20 bg-slate-100 rounded" />
                </div>

                <div className="overflow-x-auto select-none">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-400 font-semibold">
                        <th className="px-6 py-3.5 w-1/3">文档名称</th>
                        <th className="px-6 py-3.5">文件大小</th>
                        <th className="px-6 py-3.5">解析字符数</th>
                        <th className="px-6 py-3.5">当前状态</th>
                        <th className="px-6 py-3.5">上传时间</th>
                        <th className="px-6 py-3.5 text-right">管理操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[1, 2, 3].map((i) => (
                        <tr key={i}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 bg-slate-200 rounded shrink-0" />
                              <div className="h-3 w-40 bg-slate-200 rounded" />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-12 bg-slate-200 rounded" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-16 bg-slate-200 rounded" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-5 w-24 bg-slate-150 rounded-full" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 rounded" />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-12 bg-slate-150 rounded ml-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* KB List Overview Skeleton */
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {/* Page Header */}
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none pb-4 border-b border-slate-200 animate-pulse">
              <div>
                <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Database className="h-5.5 w-5.5 text-slate-400" />
                  本地知识管理中心
                </h1>
                <div className="h-3.5 w-[360px] bg-slate-200 rounded mt-1.5" />
              </div>

              <div className="h-8.5 w-24 bg-slate-200 rounded-xl" />
            </header>

            {/* Knowledge Bases Cards Grid list Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between h-52 animate-pulse">
                  <div>
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3.5" />
                    <div className="h-4 w-32 bg-slate-200 rounded mb-2.5" />
                    <div className="h-3 w-48 bg-slate-100 rounded mb-1.5" />
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                  </div>
                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                    <div className="flex gap-4">
                      <div className="h-5 w-12 bg-slate-100 rounded" />
                      <div className="h-5 w-16 bg-slate-100 rounded" />
                    </div>
                    <div className="h-4 w-12 bg-slate-150 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
