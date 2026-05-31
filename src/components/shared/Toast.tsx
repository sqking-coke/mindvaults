"use client";

import React from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { usemindvaults } from "@/context/mindvaultsContext";

export default function Toast() {
  const { toast } = usemindvaults();

  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${
          isSuccess
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}
      >
        {isSuccess ? (
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        )}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
