"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Chat Page Header Skeleton */}
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md pl-16 pr-6 md:px-6 flex items-center justify-between shrink-0 z-10 select-none">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-slate-300 animate-pulse" />
            <div className="h-4 w-32 md:w-48 bg-slate-200 rounded animate-pulse" />
            <span className="text-[10px] bg-slate-100 text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
              局域网物理隔离
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <div className="h-3 w-28 bg-slate-200 rounded" />
            </div>
            
            <div className="flex items-center gap-1 bg-emerald-50/50 text-emerald-600/70 text-[11px] font-semibold px-2 py-1 rounded-lg border border-emerald-100/50 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>数据不出域</span>
            </div>
          </div>
        </header>

        {/* Messages Scroll Zone Skeleton */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 select-none bg-slate-50/50">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Bot Message Skeleton */}
            <div className="flex gap-3 items-start animate-pulse">
              <div className="h-8 w-8 rounded-xl bg-slate-200 shrink-0" />
              <div className="space-y-2 flex-1 max-w-xl">
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="bg-white border border-slate-150 p-4 rounded-2xl rounded-tl-none shadow-sm space-y-2">
                  <div className="h-3.5 w-full bg-slate-200 rounded" />
                  <div className="h-3.5 w-[90%] bg-slate-200 rounded" />
                  <div className="h-3.5 w-[60%] bg-slate-200 rounded" />
                </div>
              </div>
            </div>

            {/* User Message Skeleton */}
            <div className="flex gap-3 items-start justify-end animate-pulse">
              <div className="space-y-2 flex flex-col items-end flex-1 max-w-xl">
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="bg-indigo-50 border border-indigo-100/50 p-4 rounded-2xl rounded-tr-none shadow-sm text-right space-y-2 w-full max-w-xs">
                  <div className="h-3.5 w-full bg-slate-200 rounded" />
                  <div className="h-3.5 w-[80%] bg-slate-200 rounded mx-auto mr-0" />
                </div>
              </div>
              <div className="h-8 w-8 rounded-xl bg-slate-200 shrink-0" />
            </div>

            {/* Bot Message Skeleton with References */}
            <div className="flex gap-3 items-start animate-pulse">
              <div className="h-8 w-8 rounded-xl bg-slate-200 shrink-0" />
              <div className="space-y-2 flex-1 max-w-xl">
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="bg-white border border-slate-150 p-4 rounded-2xl rounded-tl-none shadow-sm space-y-2">
                  <div className="h-3.5 w-[95%] bg-slate-200 rounded" />
                  <div className="h-3.5 w-full bg-slate-200 rounded" />
                  <div className="h-3.5 w-[80%] bg-slate-200 rounded" />
                  <div className="h-3.5 w-[40%] bg-slate-200 rounded" />
                  
                  {/* Mock citations skeleton */}
                  <div className="flex gap-1.5 pt-2 border-t border-slate-100 mt-3">
                    <div className="h-5 w-12 bg-slate-200 rounded" />
                    <div className="h-5 w-12 bg-slate-200 rounded" />
                  </div>
                </div>
              </div>
            </div>

            {/* User Message Skeleton */}
            <div className="flex gap-3 items-start justify-end animate-pulse">
              <div className="space-y-2 flex flex-col items-end flex-1 max-w-xl">
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="bg-indigo-50 border border-indigo-100/50 p-4 rounded-2xl rounded-tr-none shadow-sm text-right space-y-2 w-1/2">
                  <div className="h-3.5 w-full bg-slate-200 rounded" />
                </div>
              </div>
              <div className="h-8 w-8 rounded-xl bg-slate-200 shrink-0" />
            </div>
          </div>
        </div>

        {/* Input Bar Panel Skeleton */}
        <footer className="p-4 md:p-6 border-t border-slate-200 bg-white select-none z-10 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2.5 animate-pulse">
            <div className="relative border border-slate-200 rounded-xl bg-slate-50 h-24 flex flex-col justify-between p-3">
              <div className="h-4 w-1/2 bg-slate-200 rounded" />
              <div className="flex items-center justify-between pt-2 border-t border-slate-150">
                <div className="h-4 w-32 bg-slate-200 rounded" />
                <div className="h-7 w-24 bg-slate-200 rounded-lg" />
              </div>
            </div>
            <div className="h-3 w-48 bg-slate-100 rounded mx-auto" />
          </div>
        </footer>
      </div>
  );
}
