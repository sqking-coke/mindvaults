"use client";

import React, { useState, useEffect } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { Settings, Cpu, Sliders, ArrowLeft, Braces } from "lucide-react";
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

  // OpenAI 兼容 API 下的供应商预设
  const LLM_VENDORS: Record<string, { name: string; url: string; models: string[] }> = {
    deepseek:    { name: "DeepSeek",    url: "https://api.deepseek.com/v1",   models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat"] },
    openai:      { name: "OpenAI",      url: "https://api.openai.com/v1",      models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] },
    siliconflow: { name: "硅基流动",     url: "https://api.siliconflow.cn/v1",  models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-7B-Instruct"] },
    custom:      { name: "自定义",       url: "",                               models: [] },
  };

  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [llmVendor, setLlmVendor] = useState("deepseek");  // OpenAI 模式下的供应商选择
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topK, setTopK] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Embedding (独立可选配置，默认复用 LLM Key)
  const [embProvider, setEmbProvider] = useState("same_as_llm");
  const [embBaseUrl, setEmbBaseUrl] = useState("");
  const [embModel, setEmbModel] = useState("");
  const [embApiKey, setEmbApiKey] = useState("");
  const [embCustom, setEmbCustom] = useState(false); // 是否展开自定义配置

  // Init from systemConfig
  useEffect(() => {
    if (!systemConfig) {
      loadSystemConfig();
      return;
    }
    if (loaded) return;
    setProvider((systemConfig.llm_provider || "ollama") as "ollama" | "openai");
    // 检测供应商：匹配 base_url
    const matchedVendor = Object.entries(LLM_VENDORS).find(
      ([, v]) => systemConfig.llm_base_url && v.url && systemConfig.llm_base_url.startsWith(v.url)
    );
    setLlmVendor(matchedVendor ? matchedVendor[0] : "deepseek");
    setBaseUrl(systemConfig.llm_base_url || "");
    const savedModel = systemConfig.llm_model || "";
    setModel(savedModel);
    setIsCustomModel(!!savedModel && !Object.values(LLM_VENDORS).some(v => v.models.includes(savedModel)));
    setApiKey(systemConfig.llm_api_key || "");
    setTemperature(systemConfig.llm_temperature ?? 0.3);
    setSystemPrompt(systemConfig.system_prompt || "");
    setChunkSize(systemConfig.chunk_size ?? 500);
    setChunkOverlap(systemConfig.chunk_overlap ?? 50);
    setTopK(systemConfig.top_k ?? 5);
    setSimilarityThreshold(systemConfig.similarity_threshold ?? 0.7);

    // Embedding
    const savedEmb = systemConfig.embedding_provider || "same_as_llm";
    setEmbProvider(savedEmb);
    setEmbBaseUrl(systemConfig.embedding_base_url || "");
    setEmbModel(systemConfig.embedding_model || "");
    setEmbApiKey(systemConfig.embedding_api_key || "");
    setEmbCustom(savedEmb !== "same_as_llm");
    setLoaded(true);
  }, [systemConfig, loaded, loadSystemConfig]);

  // Load Ollama models when provider is ollama
  useEffect(() => {
    if (provider === "ollama") {
      loadOllamaModels();
      if (model && !ollamaModels.includes(model)) setModel("");
    }
  }, [provider, loadOllamaModels]);

  const handleSave = async () => {
    setIsSaving(true);
    const embedPayload = embCustom
      ? { embedding_provider: embProvider, embedding_base_url: embBaseUrl, embedding_model: embModel, embedding_api_key: embApiKey }
      : { embedding_provider: "same_as_llm", embedding_api_key: "" };

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
      ...embedPayload,
    });
    setIsSaving(false);
    if (success) {
      showToast("配置已保存", "success");
    } else {
      showToast("保存失败，请检查参数", "error");
    }
  };

  // Preset base URLs for common embedding providers
  const EMB_PRESETS: Record<string, { url: string; models: string[] }> = {
    openai:      { url: "https://api.openai.com/v1",       models: ["text-embedding-3-small", "text-embedding-3-large"] },
    siliconflow: { url: "https://api.siliconflow.cn/v1",   models: ["BAAI/bge-large-zh-v1.5", "BAAI/bge-m3"] },
    ollama:      { url: "http://localhost:11434",           models: [] },
    custom:      { url: "",                                 models: [] },
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
                  onClick={() => { setProvider("ollama"); setBaseUrl("http://localhost:11434"); setModel(""); setIsCustomModel(false); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    provider === "ollama" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  本地 Ollama
                </button>
                <button
                  onClick={() => { setProvider("openai"); setBaseUrl(LLM_VENDORS[llmVendor].url); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    provider === "openai" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  OpenAI 兼容 API
                </button>
              </div>
            </div>

            {/* 供应商选择 — 仅 OpenAI 模式 */}
            {provider === "openai" && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">选择供应商</label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 flex-wrap">
                  {Object.entries(LLM_VENDORS).map(([key, { name, url }]) => (
                    <button
                      key={key}
                      onClick={() => { setLlmVendor(key); setBaseUrl(url); }}
                      className={`flex-1 min-w-[70px] py-2 text-xs font-semibold rounded-lg transition-all ${
                        llmVendor === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              {provider !== "ollama" && (
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
              <div className="flex gap-2">
                <select
                  value={
                    provider === "ollama"
                      ? (ollamaModels.includes(model) ? model : isCustomModel ? "custom" : "")
                      : (LLM_VENDORS[llmVendor]?.models.includes(model) ? model : isCustomModel ? "custom" : "")
                  }
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setModel("");
                      setIsCustomModel(true);
                    } else {
                      setModel(e.target.value);
                      setIsCustomModel(false);
                    }
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                >
                  {provider === "ollama"
                    ? [
                        <option key="__empty" value="" disabled>-- 选择本地模型 --</option>,
                        ...ollamaModels.map((m) => (<option key={m} value={m}>{m}</option>))
                      ]
                    : [
                        <option key="__empty" value="" disabled>-- 选择模型 --</option>,
                        ...(LLM_VENDORS[llmVendor]?.models || []).map((m) => (<option key={m} value={m}>{m}</option>))
                      ]
                  }
                  <option value="custom">自定义...</option>
                </select>
                <input
                  type="text" value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="自定义模型代号"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
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

        {/* Section 2: Embedding */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Braces className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-bold text-slate-700">Embedding 向量化模型</h2>
          </div>
          <div className="p-6 space-y-4">
            {!embCustom ? (
              /* 默认：复用 LLM Key */
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">复用大模型 API Key</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      向量化请求将复用上方配置的 Base URL 和 API Key。
                      {provider === "ollama" && " Ollama 本地模型自带 Embedding 能力，无需额外配置。"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEmbCustom(true);
                      setEmbProvider("siliconflow");
                      setEmbBaseUrl(EMB_PRESETS.siliconflow.url);
                      setEmbApiKey(apiKey);
                    }}
                    className="shrink-0 text-[11px] font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    自定义
                  </button>
                </div>
              </div>
            ) : (
              /* 独立配置 Embedding */
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    <span className="text-xs font-semibold text-slate-600">自定义 Embedding 配置</span>
                  </div>
                  <button
                    onClick={() => setEmbCustom(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    切换为复用
                  </button>
                </div>

                {/* Embedding Provider */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">供应商</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    {Object.entries(EMB_PRESETS).map(([key, { url }]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setEmbProvider(key);
                          setEmbBaseUrl(url);
                          if (key === "ollama") setEmbApiKey("");
                        }}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${
                          embProvider === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {key === "siliconflow" ? "硅基流动" : key === "ollama" ? "本地 Ollama" : key === "openai" ? "OpenAI" : key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Embedding Base URL + API Key */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Base URL</label>
                    <input
                      type="text" value={embBaseUrl}
                      onChange={(e) => setEmbBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  {embProvider !== "ollama" && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">API Key</label>
                      <input
                        type="password" value={embApiKey}
                        onChange={(e) => setEmbApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </div>
                  )}
                </div>

                {/* Embedding Model */}
                {embProvider !== "ollama" && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">模型</label>
                    <div className="flex gap-2">
                      <select
                        value={EMB_PRESETS[embProvider]?.models.includes(embModel) ? embModel : "custom"}
                        onChange={(e) => { if (e.target.value !== "custom") setEmbModel(e.target.value); }}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer"
                      >
                        {(EMB_PRESETS[embProvider]?.models || []).map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="custom">自定义...</option>
                      </select>
                      <input
                        type="text" value={embModel}
                        onChange={(e) => setEmbModel(e.target.value)}
                        placeholder="自定义模型名"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Section 3: RAG */}
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
