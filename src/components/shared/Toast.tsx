"use client";

import React from "react";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { usemindvaults } from "@/context/mindvaultsContext";

const TOAST_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700",
    icon: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />,
  },
  error: {
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700",
    icon: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
  },
  warning: {
    bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",
    icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
  },
};

export default function Toast() {
  const { toast } = usemindvaults();

  if (!toast) return null;

  const s = TOAST_STYLES[toast.type] || TOAST_STYLES.error;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${s.bg} ${s.border} ${s.text}`}>
        {s.icon}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
