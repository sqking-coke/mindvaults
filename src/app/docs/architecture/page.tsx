"use client";

import React from "react";

export default function Architecture() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">系统架构</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          mindvaults 采用经典的三层 Web 架构，前端 Next.js → 后端 FastAPI → 数据层 PostgreSQL/pgvector + Redis，AI 引擎层可选本地 Ollama 或云端 API。
        </p>
      </div>

      {/* Architecture diagram as ASCII/text */}
      <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto">
        <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre">
{`┌─────────────────────────────────────────────────────────┐
│                     🖥️ 用户浏览器                         │
│                  http://localhost:80                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│               🔀 Nginx :80 (反向代理)                     │
│         / → Frontend :3000   /api/* → Backend :8000     │
│         SSE 流式免缓冲 (proxy_buffering off)              │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│ 🎨 Frontend      │    │ ⚙️ Backend :8000                  │
│ Next.js 14       │    │ FastAPI + Uvicorn                 │
│ App Router       │    │                                    │
│ TailwindCSS      │    │ ┌────────────────────────────┐   │
│ TypeScript       │    │ │ RAG Engine                  │   │
└──────────────────┘    │ │ • 意图识别                   │   │
                         │ │ • pgvector HNSW 向量检索    │   │
                         │ │ • BCE Reranker 精排        │   │
                         │ │ • LLM 流式推理             │   │
                         │ └────────────────────────────┘   │
                         │                                    │
                         │ ┌────────────────────────────┐   │
                         │ │ 文档摄入管道                 │   │
                         │ │ Parser → Chunker →          │   │
                         │ │ Embedder → Ingester         │   │
                         │ └────────────────────────────┘   │
                         └──────────┬───────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 💾 PostgreSQL    │  │ 📦 Redis :6379   │  │ 🧠 Ollama        │
│ pgvector :5432   │  │ (全栈模式)        │  │ :11434 (全栈模式) │
│                  │  │                   │  │                   │
│ • kb_documents   │  │ • 检索缓存        │  │ • LLM 推理        │
│ • kb_chunks      │  │ • 限流计数器      │  │ • Embedding 向量化│
│ • kb_sessions    │  │ • 会话状态        │  │                   │
│ • kb_qa_records  │  │                   │  │                   │
│ • kb_config      │  │                   │  │                   │
└──────────────────┘  └──────────────────┘  └──────────────────┘`}
        </pre>
      </div>

      <div id="rag">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">RAG 检索流水线</h2>
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 dark:text-slate-300">第一级：向量粗排 (HNSW)</h3>
            <p className="text-xs text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
              用户提问经 Embedding 模型转换为 1024 维稠密向量 → pgvector HNSW 索引以亚毫秒级在图结构中跳跃搜索
              → 从所有文档分块中快速锁定 Top-50 候选，耗时约 12ms。
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 dark:text-slate-300">第二级：BCE Reranker 精排</h3>
            <p className="text-xs text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
              50 个候选分块进入 BCE Reranker 交叉编码器 → 用户提问与每个候选拼接后做深度语义交互打分
              → 精确评估每个分块对回答的真实贡献度 → 保留 Top-5 高分片段注入 LLM 上下文。
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 dark:text-slate-300">第三级：LLM 生成 + 引用溯源</h3>
            <p className="text-xs text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
              Top-5 分块 + 系统提示词 + 对话历史 → 组装为 Prompt → 发送至 LLM 推理
              → SSE 流式逐 token 返回 → 前端打字机效果实时渲染 → 引用角标精确标注来源文档和相似度评分。
            </p>
          </div>
        </div>
      </div>

      <div id="database">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">数据库设计</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">表名</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">说明</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">关键字段</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_knowledge_bases</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">知识库</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, name, description, created_at</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_documents</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">文档元数据</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, kb_id, filename, status, chunk_count, file_size, uploaded_at</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_chunks</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">文档切片 + 向量</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, document_id, kb_id, content, embedding (pgvector), chunk_index</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_sessions</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">对话会话</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, kb_id, title, created_at</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_qa_records</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">问答记录</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, session_id, question, answer, ref_chunks, model_name, created_at</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">kb_config</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">系统配置（单行）</td>
                <td className="px-4 py-2 font-mono text-slate-400 text-[11px] dark:text-slate-500">id, llm_provider, llm_model, chunk_size, top_k, ...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="ingestion">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">文档摄入管道</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-3 dark:text-slate-400 dark:text-slate-500">
          文档上传后进入异步摄入管道，顺序执行以下阶段：
        </p>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-xs text-slate-300 font-mono leading-relaxed">
{`用户上传文件 (multipart/form-data)
  │
  ▼
① Parser (parser_service.py)
    PyPDF2 / python-docx / markdown → 提取纯文本
  │
  ▼
② Chunker (chunking_service.py)
    按 chunk_size 分割 + chunk_overlap 重叠 → 生成切片列表
  │
  ▼
③ Embedder (embedding_service.py)
    BGE-large-zh-v1.5 / OpenAI → 每个切片生成 1024d 向量
  │
  ▼
④ Ingester (ingestion_service.py)
    批量 INSERT INTO kb_chunks → pgvector HNSW 索引自动构建
  │
  ▼
⑤ 更新 kb_documents.status = 'success' (或 'failed')`}
          </pre>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          ⚠️ 摄入管道是异步的。上传 API 立即返回，前端通过轮询文档状态获取进度。
        </p>
      </div>
    </div>
  );
}
