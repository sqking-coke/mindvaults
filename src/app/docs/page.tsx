"use client";

import React from "react";
import Link from "next/link";
import { Rocket, Server, Settings, Code, Box, ArrowRight, Github } from "lucide-react";

export default function DocsHome() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          mindvaults 技术文档
        </h1>
        <p className="mt-3 text-slate-500 leading-relaxed max-w-xl dark:text-slate-400 dark:text-slate-500">
          本地私有化 RAG 知识库的完整技术参考。从快速上手到深度架构，涵盖部署、配置、API 与运维全链路。
        </p>
      </div>

      {/* Quick Path Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: <Rocket className="h-5 w-5" />,
            label: "5 分钟快速上手",
            desc: "Docker 一键启动，跑通问答闭环",
            href: "/docs/quickstart",
            bg: "bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-500/10 dark:to-blue-500/10 border-indigo-100",
            iconBg: "bg-indigo-500",
            badge: null,
          },
          {
            icon: <Server className="h-5 w-5" />,
            label: "部署指南",
            desc: "轻量 / 全栈双模式，24 项环境变量详解",
            href: "/docs/deployment",
            bg: "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border-emerald-100",
            iconBg: "bg-emerald-500",
            badge: "推荐",
          },
          {
            icon: <Code className="h-5 w-5" />,
            label: "API 参考",
            desc: "RESTful 接口、鉴权、SSE 流式规范",
            href: "/docs/api",
            bg: "bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10 border-violet-100",
            iconBg: "bg-violet-500",
            badge: null,
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group relative rounded-2xl border p-5 ${card.bg} hover:shadow-md transition-all duration-200`}
          >
            {card.badge && (
              <span className="absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white shadow-sm">
                {card.badge}
              </span>
            )}
            <div
              className={`h-9 w-9 rounded-xl ${card.iconBg} flex items-center justify-center text-white mb-3 shadow-sm group-hover:scale-110 transition-transform`}
            >
              {card.icon}
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1 dark:text-slate-200">{card.label}</h3>
            <p className="text-xs text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">{card.desc}</p>
            <span className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all dark:text-indigo-400">
              开始阅读 <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>

      {/* Full documentation index */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* 部署运维 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Server className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">部署运维</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: "Docker Compose 一键部署", href: "/docs/deployment" },
              { label: "轻量模式 vs 全栈模式", href: "/docs/deployment#轻量模式" },
              { label: "Nginx 反向代理配置", href: "/docs/deployment#nginx" },
              { label: "开发环境手动构建", href: "/docs/deployment#开发环境" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-xs text-slate-600 hover:text-indigo-600 py-1 transition-colors dark:text-slate-400 dark:text-slate-500 dark:text-indigo-400"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 配置参考 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Settings className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">配置参考</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: "24 项环境变量完整说明", href: "/docs/config" },
              { label: "4 种 Provider 组合方案", href: "/docs/config#provider" },
              { label: "Ollama 本地模型配置", href: "/docs/config#ollama" },
              { label: "Embedding 向量维度适配", href: "/docs/config#embedding" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-xs text-slate-600 hover:text-indigo-600 py-1 transition-colors dark:text-slate-400 dark:text-slate-500 dark:text-indigo-400"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* API 参考 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <Code className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">API 参考</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: "鉴权与限流机制", href: "/docs/api#auth" },
              { label: "文档管理 API (7 端点)", href: "/docs/api#documents" },
              { label: "智能问答 API (SSE 流式)", href: "/docs/api#chat" },
              { label: "知识库运维与统计 API", href: "/docs/api#ops" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-xs text-slate-600 hover:text-indigo-600 py-1 transition-colors dark:text-slate-400 dark:text-slate-500 dark:text-indigo-400"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 架构设计 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Box className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">架构设计</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: "系统架构全景图", href: "/docs/architecture" },
              { label: "RAG 双级检索流水线", href: "/docs/architecture#rag" },
              { label: "数据库 ER 与表设计", href: "/docs/architecture#database" },
              { label: "摄入管道异步编排", href: "/docs/architecture#ingestion" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-xs text-slate-600 hover:text-indigo-600 py-1 transition-colors dark:text-slate-400 dark:text-slate-500 dark:text-indigo-400"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* GitHub link */}
      <div className="border-t border-slate-100 pt-8 mt-8">
        <a
          href="https://github.com/sqking-coke/mindvaults"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <Github className="h-4 w-4" />
          Star on GitHub
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </a>
      </div>
    </div>
  );
}
