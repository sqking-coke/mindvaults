"use client";

import React from "react";
import { Github, X, Download } from "lucide-react";
import Link from "next/link";

export default function DemoBanner() {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white">
      <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-center text-xs font-medium relative">
        <div className="flex items-center gap-3">
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">
            演示环境
          </span>
          <span className="text-white/90">
            这是一个公开演示实例，文档和对话会定期清理。体验满意后请自部署。
          </span>
          <a
            href="https://github.com/sqking-coke/mindvaults"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-white font-semibold"
          >
            <Download className="h-3 w-3" />
            自行部署
          </a>
          <Link
            href="/docs"
            className="flex items-center gap-1 text-white/80 hover:text-white transition-colors"
          >
            部署指南 →
          </Link>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-4 p-1 hover:bg-white/10 rounded transition-colors shrink-0"
          aria-label="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
