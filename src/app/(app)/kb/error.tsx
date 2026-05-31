"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function KBError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an analytics or error tracking service
    console.error("Knowledge base page error caught by boundary:", error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden justify-center items-center p-6 bg-slate-50/50">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-6 select-none">
          {/* Error Icon */}
          <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto shadow-sm shadow-red-100">
            <AlertCircle className="h-7 w-7" />
          </div>

          {/* Text Content */}
          <div className="space-y-2">
            <h2 className="text-base font-bold text-slate-800">本地知识库管理加载失败</h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
              本地知识库挂载、切片提取或文档列表展示模块发生了未捕获异常。这通常与本地索引加载失败或文件元数据损坏有关。
            </p>
          </div>

          {/* Collapsible Error Code Details */}
          <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-left font-mono text-[10px] text-slate-500 overflow-x-auto max-h-24 select-text">
            <span className="font-semibold text-slate-700">错误描述: </span>
            {error.message || "未知异常 (Unknown Error)"}
            {error.digest && (
              <div className="mt-1">
                <span className="font-semibold text-slate-700">Digest Code: </span>
                {error.digest}
              </div>
            )}
          </div>

          {/* Interaction Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
            <button
              onClick={() => reset()}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-md shadow-indigo-600/10 text-xs transition-all flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新尝试加载
            </button>
            
            <Link
              href="/chat"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-slate-350"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              前往聊天对话
            </Link>
          </div>
        </div>

        {/* Diagnostic Tip */}
        <p className="text-[10px] text-slate-400 text-center select-none mt-6 max-w-xs leading-normal">
          提示：若问题持续存在，请检查本地物理文档存储位置的可读写权限，或检查本地 HNSW 挂载状态是否正常。
        </p>
      </div>
  );
}
