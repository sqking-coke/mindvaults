"use client";

import React from "react";

export default function QuickStart() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">快速上手</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          从零开始，5 分钟内启动 mindvaults 并完成第一次 RAG 问答。
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>前置条件：</strong>已安装 Docker Desktop 或 Docker Engine 20.10+，确保至少 4GB 可用内存。
      </div>

      {/* Step 1 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500 text-white text-xs font-bold shrink-0">1</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">克隆项目并启动服务</h2>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed">
{`git clone https://github.com/sqking-coke/mindvaults.git
cd mindvaults
# 轻量模式：LLM/Embedding 走云端 API（推荐新手）
docker compose up -d
# 全栈模式：启动 Ollama 本地推理
docker compose --profile full up -d`}
          </pre>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">首次启动需拉取镜像，约 3-5 分钟。启动后访问 <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">http://localhost:3000</code>。</p>
      </div>

      {/* Step 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500 text-white text-xs font-bold shrink-0">2</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">配置 LLM / Embedding Provider</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          进入控制台左侧边栏 → 点击齿轮图标 → 在「系统配置」中设置：
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">模式</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">LLM Provider</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">Base URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">本地 Ollama</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">http://localhost:11434</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">DeepSeek</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">https://api.deepseek.com/v1</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">OpenAI</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">https://api.openai.com/v1</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500 text-white text-xs font-bold shrink-0">3</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">创建知识库 & 上传文档</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          点击左侧「知识中心」→ 点击「新建知识库」→ 拖拽或点击上传 PDF、Markdown、Word 或 TXT 文件。
          系统自动完成解析 → 切片 → 向量化 → 入库，大型文件可能需要几秒到几十秒。
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          <strong className="text-slate-700 dark:text-slate-300">💡 提示：</strong>支持同时选择多个文件批量上传。文档解析进度在「运维管理」页面可实时查看。
        </div>
      </div>

      {/* Step 4 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500 text-white text-xs font-bold shrink-0">4</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">开始提问</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          返回「对话沙盒」，在底部输入框输入你的问题。系统自动执行意图识别 → 向量检索 → 片段匹配 → LLM 生成，
          返回带引用溯源的答案。每个断言都标注了来源文档、页码和相似度评分。
        </p>
      </div>

      <div className="border-t border-slate-100 pt-6 mt-8">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          下一步：阅读<a href="/docs/deployment" className="text-indigo-600 hover:underline dark:text-indigo-400">部署指南</a>了解双模式部署详情，
          或查看<a href="/docs/config" className="text-indigo-600 hover:underline dark:text-indigo-400">配置参考</a>进行深度定制。
        </p>
      </div>
    </div>
  );
}
