"use client";

import React from "react";
import Sidebar from "@/components/layout/Sidebar";
import DemoBanner from "@/components/shared/DemoBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
      <DemoBanner />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
