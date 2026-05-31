"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Server,
  Settings,
  Code,
  Box,
  ChevronDown,
  ChevronRight,
  Home,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: { href: string; label: string; badge?: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "欢迎",
    icon: <BookOpen className="h-4 w-4" />,
    items: [
      { href: "/docs", label: "文档首页" },
      { href: "/docs/quickstart", label: "快速上手" },
    ],
  },
  {
    label: "部署运维",
    icon: <Server className="h-4 w-4" />,
    items: [
      { href: "/docs/deployment", label: "Docker 部署", badge: "推荐" },
      { href: "/docs/deployment#轻量模式", label: "轻量模式 (4 容器)" },
      { href: "/docs/deployment#全栈模式", label: "全栈模式 (6 容器)" },
    ],
  },
  {
    label: "配置参考",
    icon: <Settings className="h-4 w-4" />,
    items: [
      { href: "/docs/config", label: "环境变量" },
      { href: "/docs/config#provider", label: "Provider 组合" },
      { href: "/docs/config#ollama", label: "Ollama 配置" },
    ],
  },
  {
    label: "API 参考",
    icon: <Code className="h-4 w-4" />,
    items: [
      { href: "/docs/api", label: "REST API 概述" },
      { href: "/docs/api#auth", label: "鉴权方式" },
      { href: "/docs/api#sse", label: "SSE 流式响应" },
    ],
  },
  {
    label: "架构设计",
    icon: <Box className="h-4 w-4" />,
    items: [
      { href: "/docs/architecture", label: "系统架构" },
      { href: "/docs/architecture#rag", label: "RAG 检索流水线" },
      { href: "/docs/architecture#database", label: "数据库设计" },
    ],
  },
];

export default function DocsSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Init theme from localStorage / system preference
  useEffect(() => {
    const stored = localStorage.getItem("mv_docs_theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else if (stored === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      // Default to system preference
      const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefers) {
        document.documentElement.classList.add("dark");
        setIsDark(true);
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mv_docs_theme", next ? "dark" : "light");
  };

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) => {
    const clean = href.split("#")[0];
    if (clean === "/docs") return pathname === "/docs";
    return pathname.startsWith(clean);
  };

  const sidebar = (
    <nav className="w-60 shrink-0 h-full overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <Link href="/docs" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">文档中心</span>
            <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-medium">v0.0.1</span>
          </div>
        </Link>
      </div>

      {/* Back to app + theme toggle */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          返回控制台
        </Link>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={isDark ? "切换亮色模式" : "切换暗色模式"}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav groups */}
      <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const isCollapsed = collapsed[group.label] ?? false;
          const hasActive = group.items.some((item) => isActive(item.href));

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  hasActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span className="shrink-0">{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                )}
              </button>

              {!isCollapsed && (
                <div className="ml-2 mt-0.5 mb-1 space-y-0.5 border-l border-slate-200 dark:border-slate-800 pl-3">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isActive(item.href)
                          ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {item.label}
                        {item.badge && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <a
          href="https://github.com/sqking-coke/mindvaults"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          GitHub
        </a>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed left-4 top-3.5 z-30 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        aria-label="打开文档导航"
      >
        <BookOpen className="h-4 w-4" />
      </button>

      {/* Mobile theme toggle */}
      <button
        onClick={toggleTheme}
        className="md:hidden fixed right-4 top-3.5 z-30 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        title={isDark ? "切换亮色模式" : "切换暗色模式"}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-full">{sidebar}</div>
    </>
  );
}
