"use client";

import React from "react";

export default function ApiReference() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">API 参考</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          所有 API 端点以 <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">/api/v1</code> 为前缀。
          除 health 端点外，均需鉴权。
        </p>
      </div>

      <div id="auth">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">鉴权方式</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-3 dark:text-slate-400 dark:text-slate-500">
          所有业务 API 请求需携带 HTTP Header：
        </p>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed">
            {"Authorization: Bearer <API_KEY>"}
          </pre>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">API_KEY 通过环境变量设置，默认值见 docker-compose.yml。</p>

        <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2 dark:text-slate-300">限流规则</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">端点</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">限制</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">POST /api/v1/kb/chat</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">30 次/分钟</td></tr>
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">POST /api/v1/kb/documents</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">10 次/分钟</td></tr>
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">其他</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">不限流</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="documents">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">文档管理 API</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">方法</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">路径</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">POST</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">批量上传文档 (multipart/form-data)</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">分页查询文档列表</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">获取文档详情</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">PUT</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">更新文档名称/描述</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">DELETE</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">软删除文档</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">PUT</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}/status</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">切换启用/禁用</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">POST</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}/reindex</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">增量重索引</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="chat">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">智能问答 API</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">方法</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">路径</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">POST</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chat</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">RAG 问答（SSE 流式响应）</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chat/history</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">会话问答历史（分页）</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chat/sessions</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">会话列表</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">DELETE</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chat/sessions/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">删除会话及关联数据</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="sse">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">SSE 流式响应规范</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-3 dark:text-slate-400 dark:text-slate-500">
          <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">POST /api/v1/kb/chat</code> 返回 SSE 事件流，包含以下事件类型：
        </p>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed">
{`event: progress
data: {"stage":"intent","message":"识别用户意图...","timestamp":"..."}

event: progress
data: {"stage":"retrieval","message":"向量检索中...","timestamp":"..."}

event: progress
data: {"stage":"generation","message":"LLM 推理中...","timestamp":"..."}

event: token
data: {"text":"根据"}

event: token
data: {"text":"本地"}

event: done
data: {"message_id":"...","ref_chunks":[...],"model":"...","thinking_steps":[...]}`}
          </pre>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-slate-500 list-disc list-inside dark:text-slate-400 dark:text-slate-500">
          <li><code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">progress</code>：流程进度，前端展示推理步骤</li>
          <li><code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">token</code>：逐 token 推送，前端实现打字机效果</li>
          <li><code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">done</code>：完成信号，携带引用块和元数据</li>
        </ul>
      </div>

      <div id="ops">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">运维 & 检索 API</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">方法</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">路径</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">POST</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/retrieval/test</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">检索测试沙盒</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/documents/{'{id}'}/chunks</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">文档切片列表</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">PUT</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chunks/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">编辑切片（自动重向量化）</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">DELETE</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/chunks/{'{id}'}</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">删除切片</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/stats/overview</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">知识库运维概览</td></tr>
              <tr><td className="px-4 py-2 font-mono text-indigo-600 font-semibold dark:text-indigo-400">GET</td><td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">/api/v1/kb/stats/frequent-questions</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">高频问题 Top-N</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
