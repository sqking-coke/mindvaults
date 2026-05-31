"use client";

import React from "react";

export default function Config() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">配置参考</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed dark:text-slate-400 dark:text-slate-500">
          mindvaults 通过环境变量控制全部行为。所有变量在 <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">docker-compose.yml</code> 的 <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded dark:text-indigo-400">environment</code> 段设置。
        </p>
      </div>

      <div id="provider">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">LLM / Embedding Provider 组合</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">方案</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">LLM_PROVIDER</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">LLM_BASE_URL</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">EMBEDDING_PROVIDER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">纯本地</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">http://ollama:11434</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">DeepSeek</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">https://api.deepseek.com/v1</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">OpenAI</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">https://api.openai.com/v1</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">混合（推荐）</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">openai</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">https://api.deepseek.com/v1</td>
                <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">ollama</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">混合方案：LLM 走 DeepSeek（便宜），Embedding 走本地 Ollama（数据不出网）。</p>
      </div>

      <div>
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">核心环境变量</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-1/4 dark:text-slate-400 dark:text-slate-500">变量名</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-1/6 dark:text-slate-400 dark:text-slate-500">默认值</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                ["LLM_PROVIDER", "ollama", "LLM 推理服务提供商：ollama / openai"],
                ["LLM_MODEL", "qwen3:latest", "LLM 模型名称（Ollama tag 或 API model id）"],
                ["LLM_BASE_URL", "http://ollama:11434", "LLM API 地址"],
                ["LLM_API_KEY", "(空)", "云端 API Key（Ollama 模式留空）"],
                ["LLM_TEMPERATURE", "0.3", "生成随机性，0-1.5"],
                ["EMBEDDING_PROVIDER", "ollama", "向量化服务提供商"],
                ["EMBEDDING_MODEL", "bge-large-zh-v1.5", "Embedding 模型名"],
                ["CHUNK_SIZE", "500", "文档切片大小（字符数）"],
                ["CHUNK_OVERLAP", "50", "相邻切片重叠字符数"],
                ["TOP_K", "5", "检索返回的 Top-K 片段数"],
                ["SIMILARITY_THRESHOLD", "0.7", "向量检索最低相似度阈值"],
                ["API_KEY", "(必填)", "API 鉴权密钥"],
                ["REDIS_CACHE_ENABLED", "true", "是否启用 Redis 检索缓存"],
                ["DATABASE_URL", "postgresql+asyncpg://...", "PostgreSQL 连接串"],
                ["REDIS_URL", "redis://redis:6379/0", "Redis 连接串"],
              ].map(([name, def, desc]) => (
                <tr key={name}>
                  <td className="px-4 py-2 font-mono text-slate-700 font-medium dark:text-slate-300">{name}</td>
                  <td className="px-4 py-2 font-mono text-slate-400 dark:text-slate-500">{def}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div id="ollama">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">Ollama 模型配置</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-3 dark:text-slate-400 dark:text-slate-500">
          使用全栈模式时，需预先拉取所需模型：
        </p>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono leading-relaxed">
{`# 进入 Ollama 容器
docker exec -it mindvaults-ollama-1 bash
# 拉取 LLM 模型
ollama pull qwen3:latest
ollama pull deepseek-r1:8b
# 拉取 Embedding 模型
ollama pull bge-large-zh-v1.5
# 验证
ollama list`}
          </pre>
        </div>
      </div>

      <div id="embedding">
        <h2 className="text-base font-bold text-slate-800 mb-3 dark:text-slate-200">Embedding 向量维度适配</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">模型</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">维度</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">推荐场景</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">bge-large-zh-v1.5</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">1024</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">中文文档（推荐）</td></tr>
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">bge-m3</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">1024</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">多语言混合场景</td></tr>
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">nomic-embed-text</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">768</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">英文文档</td></tr>
              <tr><td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">text-embedding-ada-002</td><td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">1536</td><td className="px-4 py-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">OpenAI 云端</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">⚠️ 切换 Embedding 模型后需重建索引（所有文档重向量化）。</p>
      </div>
    </div>
  );
}
