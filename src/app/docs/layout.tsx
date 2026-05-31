"use client";

import React from "react";
import DocsSidebar from "@/components/docs/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex bg-white dark:bg-slate-950 overflow-hidden font-sans">
      <DocsSidebar />
      <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
