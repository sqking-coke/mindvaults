"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Settings, X } from "lucide-react";

interface ConfigRequiredDialogProps {
  open: boolean;
  onDismiss: () => void;
}

export default function ConfigRequiredDialog({ open, onDismiss }: ConfigRequiredDialogProps) {
  const router = useRouter();

  if (!open) return null;

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
              <h2 className="text-lg font-semibold text-slate-800">需要配置 API Key</h2>
              <p className="text-xs text-slate-500">大模型服务未就绪</p>
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
            <p className="text-sm text-slate-700 leading-relaxed">
              检测到当前环境尚未配置大模型 API Key，智能问答功能暂不可用。
              请前往系统设置页面，根据你使用的模型服务商填入对应的 API Key。
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-amber-400" />
                使用 DeepSeek 请填入 DeepSeek API Key
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-amber-400" />
                使用 OpenAI 请填入 OpenAI API Key
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-amber-400" />
                使用 Ollama 本地模型则无需 API Key
              </li>
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
