"use client";

import React, { useState } from "react";
import { formatDateShort } from "@/utils/date";
import { 
  Trophy, 
  Clock, 
  BarChart, 
  Copy, 
  Check, 
  ExternalLink,
  MessageSquare
} from "lucide-react";
import Link from "next/link";
import type { FrequentQuestionItem } from "@/types/api";

interface FrequentQuestionsProps {
  questions: FrequentQuestionItem[];
  isLoading: boolean;
}

export default function FrequentQuestions({ questions, isLoading }: FrequentQuestionsProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = (text: string, rank: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(rank);
    setTimeout(() => setCopiedId(null), 2000);
  };



  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="h-5 bg-slate-100 rounded-md w-36 animate-pulse"></div>
          <div className="h-4 bg-slate-100 rounded-md w-16 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 animate-pulse">
              <div className="flex items-center gap-4 w-2/3">
                <div className="h-6 w-6 bg-slate-100 rounded-full shrink-0"></div>
                <div className="h-4 bg-slate-100 rounded-md w-full"></div>
              </div>
              <div className="h-4 bg-slate-100 rounded-md w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxCount = questions.length > 0 ? Math.max(...questions.map((q) => q.count)) : 1;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Card Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h2 className="font-extrabold text-slate-800 text-sm tracking-tight">高频问题 Top-10 深度分析</h2>
        </div>
        <span className="text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-600 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          提问画像
        </span>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-x-auto">
        {questions.length === 0 ? (
          <div className="text-center py-16 text-slate-400 space-y-3">
            <BarChart className="h-10 w-10 text-slate-200 mx-auto animate-pulse" />
            <p className="text-xs font-semibold text-slate-500">当前没有收集到高频提问数据</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                <th className="py-3 px-5 text-center w-14">#</th>
                <th className="py-3 px-4">问题内容</th>
                <th className="py-3 px-4 w-32">提问频次</th>
                <th className="py-3 px-4 w-32">最近提问时间</th>
                <th className="py-3 px-5 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questions.map((item) => {
                const percentage = Math.max(5, (item.count / maxCount) * 100);
                
                // Rank styling
                let rankBadge = (
                  <span className="text-slate-400 font-mono font-bold text-xs">{item.rank}</span>
                );
                if (item.rank === 1) {
                  rankBadge = (
                    <span className="size-5 rounded-full bg-amber-500 text-white font-black text-[10px] flex items-center justify-center shadow-sm shadow-amber-500/20">
                      1
                    </span>
                  );
                } else if (item.rank === 2) {
                  rankBadge = (
                    <span className="size-5 rounded-full bg-slate-300 text-slate-800 font-black text-[10px] flex items-center justify-center shadow-sm shadow-slate-300/20">
                      2
                    </span>
                  );
                } else if (item.rank === 3) {
                  rankBadge = (
                    <span className="size-5 rounded-full bg-amber-700/80 text-white font-black text-[10px] flex items-center justify-center shadow-sm shadow-amber-700/20">
                      3
                    </span>
                  );
                }

                return (
                  <tr 
                    key={item.rank} 
                    className="hover:bg-slate-50/50 transition-colors group text-xs text-slate-700"
                  >
                    <td className="py-3.5 px-5 flex items-center justify-center">
                      {rankBadge}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800 max-w-xs sm:max-w-md truncate" title={item.question}>
                      {item.question}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-mono font-bold text-slate-700">
                          <span>{item.count}</span>
                          <span className="text-[10px] text-slate-400 font-normal">次</span>
                        </div>
                        {/* Custom Frequency Bar */}
                        <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium font-mono">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatDateShort(item.last_asked_at)}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-2">
                        {/* Copy Button */}
                        <button
                          onClick={() => handleCopy(item.question, item.rank)}
                          className="p-1 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                          title="复制问题"
                        >
                          {copiedId === item.rank ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500 animate-scale-in" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {/* Ask in Chat Link */}
                        <Link
                          href={`/chat?q=${encodeURIComponent(item.question)}`}
                          className="p-1 rounded-lg border border-indigo-100 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title="去沙盒提问"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}