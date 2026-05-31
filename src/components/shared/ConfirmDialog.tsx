"use client";

import React from "react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  position?: "center" | "sidebar";
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "确认删除",
  cancelLabel = "取消",
  variant = "danger",
  position = "center",
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === "danger";
  const isSidebar = position === "sidebar";

  return (
    <div
      className={`${
        isSidebar
          ? "absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl border border-slate-200 p-5 animate-fade-in ${
          isSidebar ? "max-w-[240px] w-full mx-3" : "max-w-sm w-full mx-4 p-6"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          <div className="text-xs text-slate-500 mt-1 leading-relaxed">
            {message}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors shadow-sm ${
              isDanger
                ? "bg-red-500 hover:bg-red-600"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
