"use client";

import React from "react";
import KBStatsPanel from "@/components/kb/KBStatsPanel";

export default function KBStatsPage() {
  return (
    <>
      {/* Header bar to balance spacing on mobile (Hamburger menu) */}
      <header className="h-16 shrink-0 md:hidden flex items-center justify-between px-6 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 select-none">
          <span className="font-bold text-slate-800 text-sm">问答统计</span>
        </div>
      </header>

      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <KBStatsPanel />
      </div>
    </>
  );
}