"use client";

import React from "react";
import { formatDateShort } from "@/utils/date";
import { 
  HelpCircle, 
  Calendar, 
  PlusCircle, 
  ChevronLeft, 
  ChevronRight,
  Inbox
} from "lucide-react";
import Link from "next/link";
import type { UnansweredItem, UnansweredListResponse } from "@/types/api";

interface UnansweredListProps {
  unansweredData: UnansweredListResponse | null;
  isLoading: boolean;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
}

export default function UnansweredList({ 
  unansweredData, 
  isLoading, 
  page, 
  setPage,
  pageSize 
}: UnansweredListProps) {

  const items = unansweredData?.items ?? [];
  const total = unansweredData?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="h-5 bg-slate-100 rounded-md w-40 animate-pulse pb-2"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl animate-pulse">
              <div className="space-y-2 w-3/4">
                <div className="h-4 bg-slate-100 rounded-md w-full"></div>
                <div className="h-3 bg-slate-100 rounded-md w-24"></div>
              </div>
              <div className="h-8 bg-slate-100 rounded-md w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Card Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-indigo-500" />
          <h2 className="font-extrabold text-slate-800 text-sm tracking-tight">
            未召回答案问题记录
          </h2>
        </div>
        <span className="text-[10px] bg-amber-50 border border-amber-150 text-amber-700 font-bold px-2 py-0.5 rounded-full">
          待补充知识
        </span>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-5 min-h-[300px] flex flex-col justify-between">
        {items.length === 0 ? (
          <div className="my-auto text-center py-10 text-slate-400 space-y-3">
            <Inbox className="h-12 w-12 text-slate-200 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">太棒了！目前没有无答案问题记录</p>
            <p className="text-[10px] text-slate-400">所有提问都在本地知识库中成功召回了匹配切片。</p>
          </div>
        ) : (
          <div className="space-y-3 mb-5">
            {items.map((item) => (
              <div 
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50/40 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl gap-3 transition-all group"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 text-xs break-all leading-relaxed" title={item.question}>
                    {item.question}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <Calendar className="h-3 w-3" />
                    <span>提问时间：{formatDateShort(item.created_at)}</span>
                    <span className="text-slate-200">•</span>
                    <span>会话ID：{item.session_id}</span>
                  </div>
                </div>

                {/* Supplement Knowledge Button */}
                <Link
                  href="/kb"
                  className="bg-white hover:bg-indigo-600 border border-slate-200 hover:border-indigo-600 text-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-sm group-hover:shadow hover:shadow-indigo-600/10 self-start sm:self-center shrink-0"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  补充知识
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 select-none text-[11px] text-slate-500 font-medium">
            <div>
              共 <span className="font-bold text-slate-700">{total}</span> 条未回答记录，
              显示第 <span className="font-bold text-slate-700">{(page - 1) * pageSize + 1}</span> - <span className="font-bold text-slate-700">{Math.min(page * pageSize, total)}</span> 条
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                title="上一页"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              
              <span className="px-2">
                页码 <span className="font-bold text-slate-700">{page}</span> / {totalPages}
              </span>

              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                title="下一页"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}