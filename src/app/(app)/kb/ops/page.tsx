"use client";

import React from "react";
import KBOpsPanel from "@/components/kb/KBOpsPanel";

export default function KBOpsPage() {
  return (
    <>
      {/* Header bar to balance spacing on mobile (Hamburger menu) */}
      <header className="h-16 shrink-0 md:hidden flex items-center justify-between px-6 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 select-none">
          <span className="font-bold text-slate-800 text-sm">知识库运维</span>
        </div>
      </header>

      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <KBOpsPanel />
      </div>
    </>
  );
}