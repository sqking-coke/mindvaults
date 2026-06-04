"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Settings, X, Key, Cpu } from "lucide-react";

interface ConfigRequiredDialogProps {
  open: boolean;
  onDismiss: () => void;
  /** 后端返回的具体错误信息，用于区分 LLM / Embedding key 问题 */
  errorMessage?: string;
}

export default function ConfigRequiredDialog({ open, onDismiss, errorMessage }: ConfigRequiredDialogProps) {
  const router = useRouter();

  if (!open) return null;

  // 根据关键词判断是 LLM 还是 Embedding 的问题
  const isEmbedding = /embedding/i.test(errorMessage || "");
  const icon = isEmbedding ? Cpu : Key;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Settings className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {isEmbedding ? "需要配置 Embedding API Key" : "需要配置 API Key"}
              </h2>
              <p className="text-xs text-slate-500">
                {isEmbedding ? "向量化服务未就绪" : "大模型服务未就绪"}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            {/* 后端具体错误 */}
            {errorMessage && (
              <p className="text-sm text-red-600 font-medium mb-3 leading-relaxed">
                {errorMessage}
              </p>
            )}
            <p className="text-sm text-slate-700 leading-relaxed">
              {isEmbedding
                ? "向量化（Embedding）服务未就绪，文档和问题无法转为向量进行检索。"
                : "大模型服务未就绪，智能问答功能暂不可用。"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              请前往设置页面检查对应配置：
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>· 大模型配置 → 推理 API Key（DeepSeek / OpenAI）</li>
              <li>· Embedding 配置 → 向量化 API Key（SiliconFlow / OpenAI）</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex items-center gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={() => {
              onDismiss();
              router.push("/settings");
            }}
            className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <Settings className="h-4 w-4" />
            去配置
          </button>
        </div>
      </div>
    </div>
  );
}
