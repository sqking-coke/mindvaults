"use client";

import React from "react";

export default function Deployment() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Docker 部署</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          mindvaults 提供<strong>轻量模式</strong>（云端 API）和<strong>全栈模式</strong>（Ollama 本地推理）双方案，
          覆盖从树莓派到 GPU 服务器的多种硬件环境。
        </p>
      </div>

      {/* Mode comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-500/10 dark:to-blue-500/10 border border-indigo-100 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-indigo-800 mb-2">☁️ 轻量模式</h2>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500">
            <li>• <strong>4 容器：</strong>Nginx + Frontend + Backend + PostgreSQL</li>
            <li>• LLM/Embedding 走云端 API（DeepSeek/OpenAI/Qwen）</li>
            <li>• 内存占用 ~1.5 GB</li>
            <li>• 无需 GPU</li>
            <li>• 适合开发环境、低配 VPS</li>
          </ul>
          <div className="mt-3 bg-slate-900 rounded-lg p-3">
            <code className="text-xs text-slate-300 font-mono">docker compose up -d</code>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border border-emerald-100 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-emerald-800 mb-2">🏠 全栈模式</h2>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500">
            <li>• <strong>6 容器：</strong>轻量模式 + Redis + Ollama</li>
            <li>• 100% 本地推理，绝不出网</li>
            <li>• 内存占用 ~6-8 GB（取决于模型）</li>
            <li>• 推荐 Apple M 系列 / Nvidia GPU</li>
            <li>• 适合企业内网、涉密环境</li>
          </ul>
          <div className="mt-3 bg-slate-900 rounded-lg p-3">
            <code className="text-xs text-slate-300 font-mono">docker compose --profile full up -d</code>
          </div>
        </div>
      </div>

      {/* Service topology */}
      <div id="nginx">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">服务拓扑</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">服务</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">端口</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">镜像</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">用途</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Nginx</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">80</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">nginx:alpine</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">反向代理，SSE 免缓冲</td></tr>
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Frontend</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">3000</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">node:20-alpine</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">Next.js 14 用户界面</td></tr>
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Backend</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">8000</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">python:3.11-slim</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">FastAPI RAG 核心引擎</td></tr>
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">PostgreSQL</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">5432</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">pgvector/pgvector:pg16</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">业务数据 + 向量存储</td></tr>
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Redis *</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">6379</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">redis:7-alpine</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">检索缓存，限流计数</td></tr>
              <tr><td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Ollama *</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">11434</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama/ollama</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">LLM 推理 + Embedding</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">* 标记的服务仅在全栈模式下启动。</p>
      </div>

      {/* Dev env */}
      <div id="开发环境">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">开发环境手动构建</h2>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed">
{`# 1. 启动基础设施
docker compose up -d postgres redis

# 2. 后端
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. 前端
cd ..
npm install
npx next dev`}
          </pre>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          完整部署文档及故障排查见 <a href="https://github.com/sqking-coke/mindvaults/blob/main/docs/DEPLOYMENT_GUIDE.md" className="text-indigo-600 hover:underline dark:text-indigo-400" target="_blank" rel="noopener noreferrer">docs/DEPLOYMENT_GUIDE.md</a>
        </p>
      </div>
    </div>
  );
}
