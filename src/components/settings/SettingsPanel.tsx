"use client";

import React, { useState, useEffect } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { Settings, Cpu, Sliders, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SettingsPanel() {
  const {
    systemConfig,
    ollamaModels,
    loadSystemConfig,
    updateSystemConfig,
    loadOllamaModels,
    showToast,
  } = usemindvaults();

  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topK, setTopK] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Init from systemConfig
  useEffect(() => {
    if (!systemConfig) {
      loadSystemConfig();
      return;
    }
    if (loaded) return;
    setProvider((systemConfig.llm_provider || "ollama") as "ollama" | "openai");
    setBaseUrl(systemConfig.llm_base_url || "");
    setModel(systemConfig.llm_model || "");
    setApiKey(systemConfig.llm_api_key || "");
    setTemperature(systemConfig.llm_temperature ?? 0.3);
    setSystemPrompt(systemConfig.system_prompt || "");
    setChunkSize(systemConfig.chunk_size ?? 500);
    setChunkOverlap(systemConfig.chunk_overlap ?? 50);
    setTopK(systemConfig.top_k ?? 5);
    setSimilarityThreshold(systemConfig.similarity_threshold ?? 0.7);
    setLoaded(true);
  }, [systemConfig, loaded, loadSystemConfig]);

  // Load Ollama models when provider is ollama
  useEffect(() => {
    if (provider === "ollama") loadOllamaModels();
  }, [provider, loadOllamaModels]);

  const handleSave = async () => {
    setIsSaving(true);
    const success = await updateSystemConfig({
      llm_provider: provider,
      llm_base_url: baseUrl,
      llm_model: model,
      llm_api_key: apiKey,
      llm_temperature: temperature,
      system_prompt: systemPrompt,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      top_k: topK,
      similarity_threshold: similarityThreshold,
    });
    setIsSaving(false);
    if (success) {
      showToast("配置已保存", "success");
    } else {
      showToast("保存失败，请检查参数", "error");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
          <Link
            href="/chat"
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow shadow-indigo-500/20">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">系统配置</h1>
            <p className="text-[11px] text-slate-400">管理 LLM 推理引擎、知识库切片与检索参数</p>
          </div>
        </div>

        {/* Section 1: LLM */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-700">大模型推理引擎</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Provider */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">提供商</label>
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  onClick={() => { setProvider("ollama"); setBaseUrl("http://localhost:11434"); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    provider === "ollama" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  本地 Ollama
                </button>
                <button
                  onClick={() => { setProvider("openai"); setBaseUrl("https://api.deepseek.com/v1"); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    provider === "openai" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  OpenAI 兼容 API
                </button>
              </div>
            </div>

            {/* Base URL + API Key */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Base URL</label>
                <input
                  type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={provider === "ollama" ? "http://localhost:11434" : "https://api.deepseek.com/v1"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              {provider === "openai" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">API Key</label>
                  <input
                    type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              )}
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">模型</label>
              {provider === "ollama" ? (
                <select
                  value={model} onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                >
                  <option value="">-- 选择本地模型 --</option>
                  {ollamaModels.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={["deepseek-v4-pro","deepseek-v4-flash","gpt-4o","gpt-3.5-turbo"].includes(model) ? model : "custom"}
                    onChange={(e) => { if (e.target.value !== "custom") setModel(e.target.value); }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                    <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="custom">自定义...</option>
                  </select>
                  <input
                    type="text" value={model} onChange={(e) => setModel(e.target.value)}
                    placeholder="自定义模型代号"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              )}
            </div>

            {/* Temperature */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Temperature</label>
                <span className="text-xs font-bold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range" min="0" max="1.5" step="0.1" value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-slate-200"
                style={{
                  background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(temperature / 1.5) * 100}%, #e2e8f0 ${(temperature / 1.5) * 100}%, #e2e8f0 100%)`
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                <span>精确 0.0</span>
                <span>自由 1.5</span>
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">System Prompt</label>
              <textarea
                value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3} placeholder="作为 AI 问答助手的引导性人设规则..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
              />
            </div>
          </div>
        </div>

        {/* Section 2: RAG */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-bold text-slate-700">知识库切片与检索</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">切片大小</label>
                <input
                  type="number" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">重叠长度</label>
                <input
                  type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top-K</label>
                <input
                  type="number" value={topK} onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>

            {/* Similarity Threshold */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">相似度阈值</label>
                <span className="text-xs font-bold font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg">{similarityThreshold.toFixed(2)}</span>
              </div>
              <input
                type="range" min="0.1" max="1.0" step="0.05" value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-violet-500 bg-slate-200"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${((similarityThreshold - 0.1) / 0.9) * 100}%, #e2e8f0 ${((similarityThreshold - 0.1) / 0.9) * 100}%, #e2e8f0 100%)`
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                <span>宽松 0.10</span>
                <span>严格 1.00</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[10px] text-slate-500 leading-relaxed">
              ⚠️ 修改切片参数仅对<strong>新上传</strong>的文档生效。已有文档需手动重索引。
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-8 py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition-all"
          >
            {isSaving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>
    </div>
  );
}
