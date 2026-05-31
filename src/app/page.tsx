"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import "./landing.css";

// Preset responses for RAG Q&A Cognitive Sandbox
const qaResponses = {
  1: {
    thinking: [
      { text: "正在检索本地向量数据库 (余弦相似度阈值 > 0.82)...", class: "green" },
      { text: "查找到 2 个极度相关的加密财务和数据合规文档分块：", class: "blue" },
      { text: " -> [1] docs/confidential/sales_q4_finance.pdf (页码: 14, 匹配度: 94.6%)", class: "blue" },
      { text: " -> [2] docs/compliance/local_policy.md (行号: 242, 匹配度: 89.2%)", class: "blue" },
      { text: "正在调用本地大模型 Ollama: DeepSeek-R1 (8B) 进行物理不出网推理...", class: "violet" }
    ],
    answer: `<strong>您的敏感数据非常安全。</strong><br><br>当您配置 mindvaults 运行于完全本地模式（Ollama 推理 + pgvector 本地向量引擎）时，所有<strong>文档解析、文本向量化、检索比对以及最终大模型的推理生成，都是 100% 在您本机的内存与显存中完成的</strong>，没有任何对外部互联网的网络调用请求。<br><br>系统严格遵循 RAG 脱敏前置机制 <span class="citation-badge">[1]</span>。即使您选择在断网环境（Air-gapped）下操作，也无需任何激活或网络握手，知识库和模型服务均能完美独立运作。同时，任何缓存在内存中的敏感片都会在不活跃 90天后触发强制物理清空，保障机器防拆卸和数据隔离物理安全 <span class="citation-badge">[2]</span>。`
  },
  2: {
    thinking: [
      { text: "初始化本地精确 RAG 检索链路...", class: "green" },
      { text: "检索并命中本地政策合规与技术架构文档分块：", class: "blue" },
      { text: " -> [1] docs/compliance/local_policy.md (行号: 242, 匹配度: 89.2%)", class: "blue" },
      { text: " -> [2] docs/confidential/sales_q4_finance.pdf (页码: 14, 匹配度: 94.6%)", class: "blue" },
      { text: "正在使用本地 Qwen-2.5-14B 大脑流式组装答案并生成引用注释...", class: "violet" }
    ],
    answer: `<strong>检索的高精度和可追溯性来自于我们的“全链溯源”引擎。</strong><br><br>在问答过程中，mindvaults 会把大模型给出的每一个关键论断（如“90天非活跃自动擦除机制” <span class="citation-badge">[2]</span>）精确匹配到对应的原始文本分块。通过比对高维特征向量的余弦相关度评分 <span class="citation-badge">[1]</span>，我们可以直观审计是哪一个原始文件（如 <code>sales_q4_finance.pdf</code> 的第14页）给出的可靠理论依据。<br><br>这彻底消除了普通 AI 伴随的长文档“幻觉说谎”问题，做到每一句关键断言都有理有据、可追溯、可审计。`
  },
  3: {
    thinking: [
      { text: "正在加载本地 BGE-M3 向量嵌入模型 (1024 维)...", class: "green" },
      { text: "已连接 pgvector 向量索引库，当前共 142 个已编码文档分块。", class: "green" },
      { text: "进入第一阶段：HNSW 近似近邻粗排检索 (ef_search=200)...", class: "blue" },
      { text: " -> 从 142 个分块中初筛召回 Top-50 候选分块 (耗时 12ms)", class: "blue" },
      { text: "进入第二阶段：BCE Reranker 交叉编码器精排重打分...", class: "violet" },
      { text: " -> 对 50 个候选逐一计算细粒度语义相关性 (耗时 87ms)", class: "violet" },
      { text: "精排完成，筛选出 Top-5 高分片段注入大模型上下文中...", class: "violet" }
    ],
    answer: `<strong>mindvaults 采用“粗排 + 精排”两级检索流水线来兼顾速度与精度。</strong><br><br><strong>第一级 — 向量粗排 (Embedding + HNSW)：</strong>所有文档首先经由 BGE-M3 模型转换为 1024 维稠密向量，存入 pgvector 的 HNSW 索引。用户提问同样被向量化后，HNSW 算法以亚毫秒级速度在图结构中跳跃搜索，从海量分块中快速锁定 50 个“看起来最相关”的候选 <span class="citation-badge">[1]</span>。<br><br><strong>第二级 — 重排精筛 (BCE Reranker)：</strong>粗排的 50 个候选进入 BCE Reranker 交叉编码器，它会将用户提问与每个候选分块拼接后做深度语义交互打分，精确评估每个分块对回答的真实贡献度 <span class="citation-badge">[2]</span>。最终只保留得分最高的 5 个分块注入大模型，确保上下文既精炼又高度相关。<br><br>这种双级架构在保证检索召回率的同时，将无关噪点段落严格过滤在外，杜绝“垃圾进、垃圾出”。`
  },
  4: {
    thinking: [
      { text: "正在检索本地技术规范文档库 (tech_specs 向量空间)...", class: "green" },
      { text: "命中 3 个高度相关的 API 设计规范文档分块：", class: "blue" },
      { text: " -> [1] docs/standards/api_design_guide.md (行号: 88, 匹配度: 92.3%)", class: "blue" },
      { text: " -> [2] docs/standards/restful_conventions.md (行号: 156, 匹配度: 87.1%)", class: "blue" },
      { text: " -> [3] docs/standards/idempotency_patterns.md (行号: 42, 匹配度: 83.5%)", class: "blue" },
      { text: "正在调用本地大模型对三份规范进行交叉比对并合成回答...", class: "violet" }
    ],
    answer: `<strong>团队 RESTful API 设计遵循以下核心规范：</strong><br><br><strong>1. 路径命名：</strong>资源路径使用复数名词（如 <code>/api/v1/users</code>），层级不超过 3 层。URI 中只含名词不含动词，CRUD 操作通过 HTTP 方法表达（GET 查询、POST 创建、PUT 全量更新、PATCH 局部更新、DELETE 删除）<span class="citation-badge">[1]</span>。<br><br><strong>2. 异常响应体：</strong>统一使用 <code>{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "...", "details": [...] } }</code> 格式。HTTP 状态码严格遵循语义：400 参数错误、401 未认证、403 无权限、404 资源不存在、422 参数校验失败、500 服务内部异常 <span class="citation-badge">[2]</span>。<br><br><strong>3. 幂等性设计：</strong>所有写操作（POST/PUT/PATCH）均需携带客户端生成的 <code>Idempotency-Key</code> 请求头。服务端以该 Key 为索引缓存首次处理结果（TTL 24 小时），重复请求直接返回缓存结果，确保网络重试不会产生副作用 <span class="citation-badge">[3]</span>。`
  }
};

const modelMetrics = {
  ds: {
    name: "DeepSeek-R1 (8B)",
    vram: "4.8 GB",
    speed: "24 tps",
    cpu: "CPU 22%",
    barVram: "60%",
    barSpeed: "75%",
    barCpu: "22%"
  },
  qw: {
    name: "Qwen-2.5 (14B)",
    vram: "8.1 GB",
    speed: "18 tps",
    cpu: "CPU 34%",
    barVram: "92%",
    barSpeed: "56%",
    barCpu: "34%"
  },
  ll: {
    name: "Llama-3 (8B)",
    vram: "4.4 GB",
    speed: "32 tps",
    cpu: "CPU 18%",
    barVram: "55%",
    barSpeed: "98%",
    barCpu: "18%"
  }
};

export default function Home() {
  // 1. Mockup panel switching state (aligned to mindvaults actual modules)
  const [mockupView, setMockupView] = useState<"chat" | "documents" | "qa-stats" | "stats" | "security">("chat");

  // 2. Vault Combination Dial lock status state
  const [vaultLocked, setVaultLocked] = useState(true);
  const [vaultState, setVaultState] = useState<"secure" | "decrypting" | "unlocked" | "securing">("secure");
  const [vaultLogs, setVaultLogs] = useState<string[]>(["[SYSTEM]: Air-gapped secure container active.", "[SYSTEM]: Ready for local knowledge linking."]);

  // 3. Hardware model specification state
  const [activeModel, setActiveModel] = useState<"ds" | "qw" | "ll">("ds");

  // 4. Cognitive Q&A Sandbox state
  const [qaActiveId, setQaActiveId] = useState<1 | 2 | 3 | 4 | null>(null);
  const [qaSteps, setQaSteps] = useState<Array<{ text: string; class: string }>>([]);
  const [qaAnswer, setQaAnswer] = useState("");
  const [showThinkingSteps, setShowThinkingSteps] = useState(true);

  // 5. Citations and Popups state
  const [activeCitationPopup, setActiveCitationPopup] = useState<number | null>(null);

  // 6. FAQ Accordion active index state
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Ref for logging scroll
  const logBoxRef = useRef<HTMLDivElement>(null);
  const logBoxHeroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    if (logBoxHeroRef.current) logBoxHeroRef.current.scrollTop = logBoxHeroRef.current.scrollHeight;
  }, [vaultLogs]);

  // Handle Vault state transitions
  const triggerVaultAnimation = () => {
    if (vaultState === "secure") {
      setVaultState("decrypting");
      setVaultLocked(false);
      setVaultLogs(prev => [
        ...prev,
        "[SYSTEM]: Initiating local pgvector dial validation...",
        "[SYSTEM]: Authenticated key signature match!"
      ]);

      setTimeout(() => {
        setVaultState("unlocked");
        setVaultLogs(prev => [
          ...prev,
          "[SYSTEM]: Local directory linked successfully.",
          "[SYSTEM]: 142 document chunks ready in secure memory."
        ]);
      }, 1200);
    } else if (vaultState === "unlocked") {
      setVaultState("securing");
      setVaultLocked(true);
      setVaultLogs(prev => [
        ...prev,
        "[SYSTEM]: Clearing decrypted temporary RAM registers...",
        "[SYSTEM]: Enforcing offline-compliance standard..."
      ]);

      setTimeout(() => {
        setVaultState("secure");
        setVaultLogs(prev => [
          ...prev,
          "[SYSTEM]: Air-gapped secure container active.",
          "[SYSTEM]: Ready for local knowledge linking."
        ]);
      }, 1200);
    }
  };

  // Store interval refs to clean up on re-run
  const qaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qaTypeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Run Sandbox Q&A Typing Simulator
  const runSandboxQA = (id: 1 | 2 | 3 | 4) => {
    // Clear any running intervals from previous QA
    if (qaIntervalRef.current) { clearInterval(qaIntervalRef.current); qaIntervalRef.current = null; }
    if (qaTypeIntervalRef.current) { clearInterval(qaTypeIntervalRef.current); qaTypeIntervalRef.current = null; }

    setQaActiveId(id);
    setQaSteps([]);
    setQaAnswer("");
    setActiveCitationPopup(null);

    const response = qaResponses[id];
    if (!response) return;

    let stepIdx = 0;

    qaIntervalRef.current = setInterval(() => {
      if (stepIdx < response.thinking.length) {
        setQaSteps(prev => [...prev, response.thinking[stepIdx]]);
        stepIdx++;
      } else {
        clearInterval(qaIntervalRef.current!);
        qaIntervalRef.current = null;
        // Start streaming response characters
        let charIdx = 0;
        const fullAnswer = response.answer;
        let currentString = "";

        qaTypeIntervalRef.current = setInterval(() => {
          if (charIdx < fullAnswer.length) {
            const ch4 = fullAnswer.substring(charIdx, charIdx + 4);
            const ch8 = fullAnswer.substring(charIdx, charIdx + 8);
            const ch23 = fullAnswer.substring(charIdx, charIdx + 23);
            const ch6 = fullAnswer.substring(charIdx, charIdx + 6);
            if (ch4 === "<br>") {
              currentString += "<br>";
              charIdx += 4;
            } else if (ch8 === "<strong>") {
              const endTag = fullAnswer.indexOf("</strong>", charIdx);
              currentString += fullAnswer.substring(charIdx, endTag + 9);
              charIdx = endTag + 9;
            } else if (ch23 === '<span class="citation-badge"') {
              const endTag = fullAnswer.indexOf("</span>", charIdx);
              currentString += fullAnswer.substring(charIdx, endTag + 7);
              charIdx = endTag + 7;
            } else if (ch6 === "<code>") {
              const endTag = fullAnswer.indexOf("</code>", charIdx);
              currentString += fullAnswer.substring(charIdx, endTag + 7);
              charIdx = endTag + 7;
            } else {
              currentString += fullAnswer.charAt(charIdx);
              charIdx++;
            }
            setQaAnswer(currentString);
          } else {
            clearInterval(qaTypeIntervalRef.current!);
            qaTypeIntervalRef.current = null;
          }
        }, 8);
      }
    }, 400);
  };

  // Click interceptor on dangerouslySetInnerHTML to map clicks on citation badge
  const handleAnswerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("citation-badge")) {
      const text = target.innerText;
      const match = text.match(/\d+/);
      if (match) {
        const id = parseInt(match[0], 10);
        setActiveCitationPopup(id);
        const popupEl = document.getElementById(`demo-popup-${id}`);
        if (popupEl) {
          popupEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
  };

  const copyCliCommand = () => {
    navigator.clipboard.writeText("docker compose up -d").then(() => {
      alert("Command copied to clipboard!");
    });
  };

  const toggleFaq = (idx: number) => {
    setActiveFaq(prev => (prev === idx ? null : idx));
  };

  const activeMetrics = modelMetrics[activeModel];

  return (
    <div className="lp-body">
      {/* TOP NAVIGATION BAR */}
      <header className="lp-header">
        <div className="lp-nav-container">
          {/* Logo */}
          <Link href="/" className="lp-logo-link">
            <svg className="lp-logo-polygon" viewBox="0 0 24 24">
              <polygon points="12,2 14.5,8.5 21,11 14.5,13.5 12,20 9.5,13.5 3,11 9.5,8.5" fill="none" stroke="#60a5fa" strokeWidth="2" />
              <circle cx="12" cy="11" r="2.5" fill="#60a5fa" />
            </svg>
            <span className="lp-logo-text">
              mind<span>vaults</span>
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="lp-nav-middle">
            <a href="#features" className="lp-nav-link">核心特性</a>
            <a href="#onboarding" className="lp-nav-link">部署指南</a>
            <a href="#opensource" className="lp-nav-link">开源优势</a>
            <a href="#faq" className="lp-nav-link">常见问题</a>
          </div>

          {/* Navigation Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <a href="https://github.com/sqking-coke/mindvaults" className="lp-btn-nav-github" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style={{ marginRight: "0.25rem" }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <Link href="/chat" className="lp-btn-nav-primary">
              进入系统
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="lp-hero-section">
        <div className="lp-container lp-hero-content">
          <div className="lp-hero-badge">
            <span>🔒 SECURITY-FIRST LOCAL AI RAG KNOWLEDGE BASE</span>
          </div>
          <h1 className="lp-hero-title">
            你的下一代知识库
            <br />
            不在云端。
          </h1>
          <p className="lp-hero-subtitle">
            mindvaults 是一个开源、隐私至上的本地 RAG 知识库。<br />
            把 PDF、Markdown、Word 丢进来，搭配本地大模型，即刻拥有专属 AI 问答引擎。<br />
            离线索引、双屏溯源、零数据外泄<br />
            —— 你的知识，只属于你。
          </p>

          <div className="lp-hero-ctas">
            <Link href="/chat" className="lp-btn-pill-primary">
              进入知识库控制台 ➔
            </Link>
            <a href="#features" className="lp-btn-pill-secondary">
              💡 探索核心功能
            </a>
          </div>

          {/* Supported Tools Banner */}
          <div className="lp-tool-banner">
            <p>支持自由切换的主流模型和工具</p>
            <div className="lp-tool-grid">
              <div className="lp-tool-item">
                <span className="lp-tool-dot"></span> Ollama
              </div>
              <div className="lp-tool-item">
                <span className="lp-tool-dot"></span> DeepSeek R1
              </div>
              <div className="lp-tool-item">
                <span className="lp-tool-dot"></span> pgvector
              </div>
              <div className="lp-tool-item">
                <span className="lp-tool-dot"></span> Local PDF / OCR
              </div>
            </div>
          </div>

          {/* HIGH-FIDELITY INTERACTIVE SLIDESHOW CLIENT MOCKUP */}
          <div className="kanban-mockup-wrapper">
            {/* Mockup Sidebar */}
            <div className="kanban-sidebar">
              <div className="sidebar-header">
                <span>📂 mindvaults Client</span>
              </div>

              {/* New Conversation Button */}
              <div style={{ padding: "0 12px", marginBottom: 8 }}>
                <button
                  onClick={() => {
                    // 清除正在运行的演示问答定时器
                    if (qaIntervalRef.current) { clearInterval(qaIntervalRef.current); qaIntervalRef.current = null; }
                    if (qaTypeIntervalRef.current) { clearInterval(qaTypeIntervalRef.current); qaTypeIntervalRef.current = null; }
                    // 重置问答状态，恢复到初始欢迎页
                    setQaActiveId(null);
                    setQaSteps([]);
                    setQaAnswer("");
                    setMockupView("chat");
                  }}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 8,
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
                    border: "none", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  新建对话
                </button>
              </div>

              <ul className="sidebar-menu">
                <li>
                  <div className={`sidebar-item ${mockupView === "chat" ? "active" : ""}`} onClick={() => setMockupView("chat")}>
                    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    智能问答
                  </div>
                </li>
                <li>
                  <div className={`sidebar-item ${mockupView === "documents" ? "active" : ""}`} onClick={() => setMockupView("documents")}>
                    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    知识中心
                  </div>
                </li>
                <li>
                  <div className={`sidebar-item ${mockupView === "qa-stats" ? "active" : ""}`} onClick={() => setMockupView("qa-stats")}>
                    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 21H3v-18" />
                      <polyline points="7 13 11 8 15 11 21 4" />
                    </svg>
                    问答统计
                  </div>
                </li>
                <li>
                  <div className={`sidebar-item ${mockupView === "stats" ? "active" : ""}`} onClick={() => setMockupView("stats")}>
                    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    运行诊断
                  </div>
                </li>
              </ul>
            </div>

            {/* VIEW 1: AI 智能问答 — 与 /chat 一致的界面 */}
            {mockupView === "chat" && (
              <div className="kanban-main" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", background: "#f8fafc" }}>
                {/* Chat Header */}
                <header style={{ height: 56, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.25rem", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", animation: "pulse 2s infinite" }} />
                    <span style={{ fontWeight: 600, fontSize: "0.8rem", color: "#1e293b" }}>
                      {qaActiveId ? "本地安全沙盒" : "本地安全沙盒"}
                    </span>
                    <span style={{ fontSize: "0.6rem", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>局域网物理隔离</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "0.6rem", color: "#94a3b8", fontWeight: 700 }}>运行智核:</span>
                    <select style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", fontSize: "0.65rem", fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                      <option>deepseek-v4-pro</option>
                      <option>deepseek-v4-flash</option>
                      <option>gpt-4o</option>
                    </select>
                  </div>
                </header>

                {/* Chat Messages Area */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
                  {qaActiveId ? (
                    /* ---- Active Q&A conversation ---- */
                    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                      {/* User Message */}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                        <div style={{ maxWidth: "80%", background: "#6366f1", color: "#fff", borderRadius: "16px 16px 4px 16px", padding: "10px 14px", fontSize: "0.78rem", fontWeight: 500, lineHeight: 1.5 }}>
                          {qaActiveId === 1 ? "🔒 我的本地知识库真的安全吗？" : qaActiveId === 2 ? "🔍 检索如何做到精确引用溯源？" : qaActiveId === 3 ? "🔍 解释一下 mindvaults 的向量嵌入 Embedding 与重排 Reranking 检索过滤原理。" : "💻 研发团队对于 RESTful API 接口的命名路径、异常响应体以及幂等性设计有什么具体规范要求？"}
                        </div>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                      </div>
                      {/* Assistant Message */}
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="2" width="20" height="16" rx="2"/><path d="M6 6h.01M6 10h.01M6 14h.01"/></svg>
                        </div>
                        <div style={{ maxWidth: "85%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", fontSize: "0.75rem", color: "#1e293b", lineHeight: 1.6, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                          {/* Thinking Steps Accordion */}
                          <div style={{ marginBottom: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                            <div onClick={() => setShowThinkingSteps(!showThinkingSteps)} style={{ padding: "8px 12px", fontSize: "0.65rem", fontWeight: 700, color: "#6366f1", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
                              <span>🧠 RAG 推理过程</span>
                              <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>{showThinkingSteps ? "收起 ▲" : "展开 ▼"}</span>
                            </div>
                            {showThinkingSteps && (
                              <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                                {qaSteps.filter(s => s && s.class).map((step, idx) => (
                                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.62rem", color: step.class === "green" ? "#059669" : step.class === "blue" ? "#2563eb" : "#7c3aed" }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: step.class === "green" ? "#10b981" : step.class === "blue" ? "#3b82f6" : "#8b5cf6", flexShrink: 0 }} />
                                    <span>{step.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Answer */}
                          <div style={{ opacity: qaAnswer ? 1 : 0.4, fontSize: "0.78rem", lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: qaAnswer || "正在由大模型推理组装回答..." }} onClick={handleAnswerClick} />
                          {/* Citation badges */}
                          {qaAnswer && (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                              <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8" }}>参考引用来源 (2)</span>
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <div onClick={() => alert("引用 [1]: sales_q4_finance.pdf — 页码 14，匹配度 94.6%")} style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: "0.6rem" }}>
                                  <span style={{ fontWeight: 700, color: "#4f46e5" }}>[1]</span> <span style={{ color: "#334155" }}>sales_q4_finance.pdf</span>
                                  <div style={{ color: "#94a3b8", marginTop: 1 }}>第 14 页 · 相似度 95%</div>
                                </div>
                                <div onClick={() => alert("引用 [2]: local_policy.md — 行号 242，匹配度 89.2%")} style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: "0.6rem" }}>
                                  <span style={{ fontWeight: 700, color: "#4f46e5" }}>[2]</span> <span style={{ color: "#334155" }}>local_policy.md</span>
                                  <div style={{ color: "#94a3b8", marginTop: 1 }}>行 242 · 相似度 89%</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ---- Welcome state — mirrors /chat page ---- */
                    <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: "1.5rem" }}>
                      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 8px 24px rgba(99,102,241,0.25)" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        </div>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>mindvaults 智能问答沙盒</h3>
                        <p style={{ fontSize: "0.7rem", color: "#94a3b8", maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
                          本地离线大语言模型驱动，安全解析您的文档资产。支持多格式解析、高精度向量相似度定位与引用溯源展示。
                        </p>
                      </div>

                      {/* Prompt Templates — same as /chat */}
                      <div style={{ marginBottom: "1.5rem" }}>
                        <h4 style={{ fontSize: "0.65rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", textAlign: "center", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          建议开始的提问模板
                        </h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[
                            { icon: "🔒", label: "数据安全提问", text: "我的本地知识库真的安全吗？上传的敏感文档会不会泄露到外网？" },
                            { icon: "🔍", label: "检索溯源提问", text: "检索如何做到精确引用溯源？大模型给出的答案能追踪到原文出处吗？" },
                            { icon: "🔍", label: "混合向量检索", text: "解释一下 mindvaults 的向量嵌入 Embedding 与重排 Reranking 检索过滤原理。" },
                            { icon: "💻", label: "研发接口标准", text: "研发团队对于 RESTful API 接口的命名路径、异常响应体以及幂等性设计有什么具体规范要求？" },
                          ].map((tmpl, i) => (
                            <div
                              key={i}
                              onClick={() => runSandboxQA((i + 1) as 1 | 2 | 3 | 4)}
                              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", cursor: "pointer", transition: "all 0.15s", fontSize: "0.65rem", lineHeight: 1.4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#a5b4fc"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.08)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
                            >
                              <div style={{ fontSize: "1rem", marginBottom: 4 }}>{tmpl.icon}</div>
                              <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 2 }}>{tmpl.label}</div>
                              <div style={{ color: "#94a3b8", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>"{tmpl.text}"</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Feature checklist */}
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 16px", fontSize: "0.62rem", color: "#64748b" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#10b981" }}>✓</span> BGE Embedding</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#10b981" }}>✓</span> HNSW 向量库</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#10b981" }}>✓</span> BCE Reranker</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#10b981" }}>✓</span> 本地 LLM 推理</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input Bar — mirrors /chat */}
                <div style={{ borderTop: "1px solid #e2e8f0", background: "#fff", padding: "12px 16px", flexShrink: 0 }}>
                  <div style={{ maxWidth: 560, margin: "0 auto" }}>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc", overflow: "hidden", transition: "border-color 0.2s" }}>
                      <textarea
                        placeholder="发送消息，或输入关键词提问有关系统架构或弹性休假的规定..."
                        rows={2}
                        readOnly
                        style={{ width: "100%", border: 0, background: "transparent", padding: "10px 14px", fontSize: "0.72rem", color: "#1e293b", resize: "none", outline: "none", lineHeight: 1.5 }}
                      />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.6rem", color: "#94a3b8" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                          附加本地知识库
                        </div>
                        <button
                          onClick={() => { if (!qaActiveId) runSandboxQA(1); }}
                          style={{ background: "#6366f1", border: 0, borderRadius: 10, padding: "6px 14px", color: "#fff", fontWeight: 600, fontSize: "0.7rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}
                        >
                          发送消息
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                      </div>
                    </div>
                    <p style={{ textAlign: "center", fontSize: "0.55rem", color: "#cbd5e1", marginTop: 8 }}>
                      模型内核: <b>deepseek-v4-pro</b> (云端 API) · 检索模式: <b>HNSW 向量粗排 + BCE Reranker 重排精选</b>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: DOCUMENT & KNOWLEDGE BASE MANAGEMENT */}
            {mockupView === "documents" && (
              <div className="kanban-main" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", background: "#f8fafc" }}>
                {/* Header */}
                <header style={{ height: 56, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.25rem", flexShrink: 0 }}>
                  <div className="breadcrumb" style={{ fontSize: "0.75rem", color: "#475569" }}>
                    mindvaults Demo &gt; <span style={{ fontWeight: 600, color: "#1e293b" }}>📂 知识库管理</span>
                  </div>
                  <button className="btn-new-issue" onClick={() => alert("演示环境：上传文档已锁定。请在正式控制台中上传本地文件。")} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer" }}>
                    + 上传本地文件
                  </button>
                </header>
                {/* Scrollable Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>

                {/* Overview Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                    <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>已载入文档</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>12 份物理文件</div>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                    <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>提取文本切片</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>142 Chunks</div>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                    <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>本地向量数据库</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#10b981", marginTop: "0.25rem" }}>pgvector (Connected)</div>
                  </div>
                </div>

                {/* Table of Documents */}
                <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>文件名</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>大小</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>切片数</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#0f172a" }}>📄 product_branding_guide.pdf</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>1.2 MB</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>32 Chunks</td>
                        <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#ecfdf5", color: "#047857", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 700 }}>解析成功</span></td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#0f172a" }}>📄 local_policy.md</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>42 KB</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>14 Chunks</td>
                        <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#ecfdf5", color: "#047857", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 700 }}>解析成功</span></td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#0f172a" }}>📄 sales_q4_finance.pdf</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>8.4 MB</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>96 Chunks</td>
                        <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#ecfdf5", color: "#047857", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 700 }}>解析成功</span></td>
                      </tr>
                      <tr>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#0f172a" }}>📄 employee_handbook.docx</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>2.1 MB</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>0 Chunks</td>
                        <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 700 }}>队列解析中</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            )}

            {/* VIEW 3: QA STATISTICS — 问答复盘统计 */}
            {mockupView === "qa-stats" && (
              <div className="kanban-main" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", background: "#f8fafc" }}>
                {/* Header */}
                <header style={{ height: 56, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", padding: "0 1.25rem", flexShrink: 0 }}>
                  <div className="breadcrumb" style={{ fontSize: "0.75rem", color: "#475569" }}>
                    mindvaults Demo &gt; <span style={{ fontWeight: 600, color: "#1e293b" }}>📈 问答统计</span>
                  </div>
                </header>
                {/* Scrollable Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
                  {/* Overview Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
                    {[
                      { label: "今日问答", value: "47", sub: "较昨日 +12%", color: "#6366f1" },
                      { label: "知识库文档", value: "12", sub: "142 切片已索引", color: "#10b981" },
                      { label: "检索命中率", value: "93.6%", sub: "阈值 0.35", color: "#f59e0b" },
                    ].map((card, i) => (
                      <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{card.label}</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 800, color: card.color }}>{card.value}</div>
                        <div style={{ fontSize: "0.6rem", color: "#94a3b8", marginTop: 2 }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* High-frequency Questions */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1.25rem", marginBottom: "1rem" }}>
                    <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
                      🔥 高频问题 Top-5
                    </h4>
                    {[
                      { q: "我的本地知识库真的安全吗？", count: 23, pct: 76 },
                      { q: "检索如何做到精确引用溯源？", count: 18, pct: 60 },
                      { q: "如何批量导入 PDF 文档？", count: 14, pct: 47 },
                      { q: "系统支持哪些大模型？", count: 11, pct: 37 },
                      { q: "向量检索的原理是什么？", count: 9, pct: 30 },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: "0.7rem" }}>
                        <span style={{ color: "#94a3b8", fontWeight: 700, width: 18, flexShrink: 0 }}>#{i + 1}</span>
                        <span style={{ flex: 1, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.q}</span>
                        <span style={{ fontWeight: 700, color: "#6366f1", width: 36, textAlign: "right", flexShrink: 0 }}>{item.count}次</span>
                        <div style={{ width: 60, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ width: `${item.pct}%`, height: "100%", background: "#6366f1", borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Unanswered Questions */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1.25rem" }}>
                    <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e293b", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
                      ⚠️ 待补充知识的问题
                    </h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#94a3b8", textAlign: "left" }}>
                          <th style={{ padding: "6px 0", fontWeight: 600 }}>问题</th>
                          <th style={{ padding: "6px 0", fontWeight: 600, width: 80 }}>出现次数</th>
                          <th style={{ padding: "6px 0", fontWeight: 600, width: 120 }}>最近出现</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { q: "季度绩效考核标准是什么？", count: 8, time: "2 小时前" },
                          { q: "远程办公设备补贴怎么申请？", count: 5, time: "昨天 16:30" },
                          { q: "新员工入职 IT 权限开通流程？", count: 4, time: "昨天 10:15" },
                        ].map((item, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f8fafc", color: "#475569" }}>
                            <td style={{ padding: "8px 0" }}>💬 {item.q}</td>
                            <td style={{ padding: "8px 0", fontWeight: 600, color: "#f59e0b" }}>{item.count} 次</td>
                            <td style={{ padding: "8px 0", color: "#94a3b8", fontSize: "0.65rem" }}>{item.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 4: RUNTIMES MONITOR & HARDWARE METRICS */}
            {mockupView === "stats" && (
              <div className="kanban-main" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", background: "#f8fafc" }}>
                {/* Header */}
                <header style={{ height: 56, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", padding: "0 1.25rem", flexShrink: 0 }}>
                  <div className="breadcrumb" style={{ fontSize: "0.75rem", color: "#475569" }}>
                    mindvaults Demo &gt; <span style={{ fontWeight: 600, color: "#1e293b" }}>📊 运行诊断</span>
                  </div>
                </header>
                {/* Scrollable Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem" }}>
                    <div className="model-swap-tabs" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                      <button className={`model-tab ${activeModel === "ds" ? "active" : ""}`} onClick={() => setActiveModel("ds")}>
                        DeepSeek-R1 (8B)
                      </button>
                      <button className={`model-tab ${activeModel === "qw" ? "active" : ""}`} onClick={() => setActiveModel("qw")}>
                        Qwen-2.5 (14B)
                      </button>
                      <button className={`model-tab ${activeModel === "ll" ? "active" : ""}`} onClick={() => setActiveModel("ll")}>
                        Llama-3 (8B)
                      </button>
                    </div>

                    <div className="diagnostic-panel" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                      <div className="metric-card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
                        <div className="metric-label" style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                          本地显存占用 (VRAM)
                        </div>
                        <div className="metric-value" style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                          {activeMetrics.vram}
                        </div>
                        <div className="progress-bar-bg" style={{ background: "#e2e8f0", height: "5px", borderRadius: "3px", marginTop: "0.5rem", overflow: "hidden" }}>
                          <div className="progress-bar-fill" style={{ width: activeMetrics.barVram, background: "#4f46e5", height: "100%", transition: "width 0.4s ease" }}></div>
                        </div>
                      </div>
                      <div className="metric-card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
                        <div className="metric-label" style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                          生成速度 (Speed/TPS)
                        </div>
                        <div className="metric-value" style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                          {activeMetrics.speed}
                        </div>
                        <div className="progress-bar-bg" style={{ background: "#e2e8f0", height: "5px", borderRadius: "3px", marginTop: "0.5rem", overflow: "hidden" }}>
                          <div className="progress-bar-fill" style={{ width: activeMetrics.barSpeed, background: "#22d3ee", height: "100%", transition: "width 0.4s ease" }}></div>
                        </div>
                      </div>
                      <div className="metric-card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
                        <div className="metric-label" style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                          硬件占用预估 (CPU)
                        </div>
                        <div className="metric-value" style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                          {activeMetrics.cpu}
                        </div>
                        <div className="progress-bar-bg" style={{ background: "#e2e8f0", height: "5px", borderRadius: "3px", marginTop: "0.5rem", overflow: "hidden" }}>
                          <div className="progress-bar-fill" style={{ width: activeMetrics.barCpu, background: "#10b981", height: "100%", transition: "width 0.4s ease" }}></div>
                        </div>
                      </div>
                      <div className="metric-card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
                        <div className="metric-label" style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                          物理安全出网隔离
                        </div>
                        <div className="metric-value" style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10b981", marginTop: "0.25rem" }}>
                          100% OFFLINE
                        </div>
                        <div className="progress-bar-bg" style={{ background: "#e2e8f0", height: "5px", borderRadius: "3px", marginTop: "0.5rem", overflow: "hidden" }}>
                          <div className="progress-bar-fill" style={{ width: "100%", background: "#10b981", height: "100%" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: SECURE LOCKER COMBINATION DIAL */}
            {mockupView === "security" && (
              <div className="kanban-main" style={{ display: "flex", padding: "1.5rem", alignItems: "center", justifyContent: "center", background: "#0b0f19" }}>
                <div className="vault-dial-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", width: "100%", maxWidth: "420px", textAlign: "center" }}>
                  <div
                    className="vault-status-indicator"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      color: vaultState === "secure" ? "var(--lp-active-mint)" : vaultState === "decrypting" ? "var(--lp-neon-cyan)" : "var(--lp-cyber-gold)",
                      background: vaultState === "secure" ? "rgba(16, 185, 129, 0.08)" : vaultState === "decrypting" ? "rgba(34, 211, 238, 0.08)" : "rgba(251, 191, 36, 0.08)",
                      borderColor: vaultState === "secure" ? "rgba(16, 185, 129, 0.2)" : vaultState === "decrypting" ? "rgba(34, 211, 238, 0.2)" : "rgba(251, 191, 36, 0.2)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      fontSize: "0.85rem"
                    }}
                  >
                    <div
                      className="status-dot"
                      style={{
                        backgroundColor: vaultState === "secure" ? "var(--lp-active-mint)" : vaultState === "decrypting" ? "var(--lp-neon-cyan)" : "var(--lp-cyber-gold)"
                      }}
                    />
                    <span>
                      {vaultState === "secure"
                        ? "STATUS: SECURE (142 Chunks Synced)"
                        : vaultState === "decrypting"
                        ? "STATUS: DECRYPTING LOCAL VAULT..."
                        : vaultState === "securing"
                        ? "STATUS: SECURING FILE DATA CHUNKS..."
                        : "STATUS: UNLOCKED & ACTIVE"}
                    </span>
                  </div>

                  <div className={`vault-svg-wrapper ${vaultLocked ? "locked" : "unlocked"}`} onClick={triggerVaultAnimation}>
                    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
                      <circle cx="50" cy="50" r="45" fill="#0f172a" stroke="#4f46e5" strokeWidth="3" />
                      <circle cx="50" cy="50" r="35" fill="none" stroke="#1e293b" strokeDasharray="4 2" strokeWidth="2" />
                      <path d="M50,15 L50,22 M50,85 L50,78 M15,50 L22,50 M85,50 L78,50 M25,25 L30,30 M75,75 L70,70" stroke="#334155" strokeWidth="1.5" />
                      <circle cx="50" cy="50" r="18" fill="#1e293b" stroke="#22d3ee" strokeWidth="1.5" />
                      <line x1="50" y1="50" x2="50" y2="36" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>

                  <button className="vault-action-btn" onClick={triggerVaultAnimation}>
                    {vaultState === "secure"
                      ? "🔒 点击旋转密码盘解锁加密金库"
                      : vaultState === "decrypting"
                      ? "🔒 正在旋转多层密码锁盘加密金库..."
                      : vaultState === "securing"
                      ? "🔒 正在加密并固化切片..."
                      : "🔓 金库已解锁！点击重新上锁"}
                  </button>

                  <div className="vault-logs" ref={logBoxHeroRef}>
                    {vaultLogs.map((log, idx) => (
                      <React.Fragment key={idx}>
                        {log}
                        <br />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CORE FEATURES SECTION */}
      <section id="features" className="features-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <h2 className="lp-section-title">安全主权，智核可视</h2>
            <p className="lp-section-desc" style={{ margin: "0 auto" }}>
              mindvaults 让复杂 AI 检索过程清晰可见，为您构建坚不可摧的数据防线。
            </p>
          </div>

          {/* Feature 1: Data Sovereignty */}
          <div className="feature-row">
            <div className="feature-info">
              <div className="feature-badge">SECURITY & SOVEREIGNTY</div>
              <h3 className="feature-title">数据主权 · 100% 物理级出网隔离</h3>
              <p className="feature-desc">
                拒绝云端“黑盒”漏洞。mindvaults 采用全本地文件解析引擎（支持 PDF, Docx, Markdown, CSV 等）与 pgvector 本地向量引擎，所有索引与存储都不经过任何外部服务器。
              </p>
              <ul className="feature-bullets">
                <li>支持完全无外网连接（Air-gapped）环境部署</li>
                <li>内置安全哈希比对，防止索引重复或冲突</li>
                <li>一键销毁本地知识库，不留任何数据残余</li>
              </ul>
            </div>
            <div className="feature-demo">
              <div className="demo-header">
                <div className="window-controls">
                  <div className="control-dot close"></div>
                  <div className="control-dot minimize"></div>
                  <div className="control-dot expand"></div>
                </div>
                <div className="window-title">security_vault_status.sh</div>
              </div>
              <div className="demo-body" style={{ backgroundColor: "#0b0f19" }}>
                <div className="vault-dial-container">
                  <div
                    className="vault-status-indicator"
                    style={{
                      color: vaultState === "secure" ? "var(--lp-active-mint)" : vaultState === "decrypting" ? "var(--lp-neon-cyan)" : "var(--lp-cyber-gold)",
                      background: vaultState === "secure" ? "rgba(16, 185, 129, 0.08)" : vaultState === "decrypting" ? "rgba(34, 211, 238, 0.08)" : "rgba(251, 191, 36, 0.08)",
                      borderColor: vaultState === "secure" ? "rgba(16, 185, 129, 0.2)" : vaultState === "decrypting" ? "rgba(34, 211, 238, 0.2)" : "rgba(251, 191, 36, 0.2)"
                    }}
                  >
                    <div
                      className="status-dot"
                      style={{
                        backgroundColor: vaultState === "secure" ? "var(--lp-active-mint)" : vaultState === "decrypting" ? "var(--lp-neon-cyan)" : "var(--lp-cyber-gold)"
                      }}
                    />
                    <span>
                      {vaultState === "secure"
                        ? "STATUS: SECURE (142 Chunks Synced)"
                        : vaultState === "decrypting"
                        ? "STATUS: DECRYPTING LOCAL VAULT..."
                        : vaultState === "securing"
                        ? "STATUS: SECURING FILE DATA CHUNKS..."
                        : "STATUS: UNLOCKED & ACTIVE"}
                    </span>
                  </div>

                  <div className={`vault-svg-wrapper ${vaultLocked ? "locked" : "unlocked"}`} onClick={triggerVaultAnimation}>
                    <svg viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="#0f172a" stroke="#4f46e5" strokeWidth="3" />
                      <circle cx="50" cy="50" r="35" fill="none" stroke="#1e293b" strokeDasharray="4 2" strokeWidth="2" />
                      <path d="M50,15 L50,22 M50,85 L50,78 M15,50 L22,50 M85,50 L78,50 M25,25 L30,30 M75,75 L70,70" stroke="#334155" strokeWidth="1.5" />
                      <circle cx="50" cy="50" r="18" fill="#1e293b" stroke="#22d3ee" strokeWidth="1.5" />
                      <line x1="50" y1="50" x2="50" y2="36" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>

                  <button className="vault-action-btn" onClick={triggerVaultAnimation}>
                    {vaultState === "secure"
                      ? "🔒 点击旋转密码盘解锁加密金库"
                      : vaultState === "decrypting"
                      ? "🔒 正在旋转多层密码锁盘加密金库..."
                      : vaultState === "securing"
                      ? "🔒 正在加密并固化切片..."
                      : "🔓 金库已解锁！点击重新上锁"}
                  </button>

                  <div className="vault-logs" ref={logBoxRef}>
                    {vaultLogs.map((log, idx) => (
                      <React.Fragment key={idx}>
                        {log}
                        <br />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Thinking Stream / Q&A Sandbox */}
          <div className="feature-row reverse">
            <div className="feature-info">
              <div className="feature-badge">COGNITIVE & TRANSPARENT</div>
              <h3 className="feature-title">思维可视化 · 让 RAG 不再是黑盒</h3>
              <p className="feature-desc">
                mindvaults 首创“流式思维指示器”（Thinking Process Accordion），将 AI 搜索、匹配、分析、推理的每一个微小动作和耗时完美呈现。
              </p>
              <ul className="feature-bullets">
                <li>实时显示本地向量库的匹配度打分与检索文档</li>
                <li>完整追踪 DeepSeek R1 的推理思维链路径</li>
                <li>网络波动或本地资源瓶颈时立即提示，拒绝无响应挂死</li>
              </ul>
            </div>
          </div>

          {/* Feature 3: Precision Citations & Source Auditing */}
          <div className="feature-row">
            <div className="feature-info">
              <div className="feature-badge">AUDIT & CITATIONS</div>
              <h3 className="feature-title">精确引用溯源 · 绝无幻觉谎言</h3>
              <p className="feature-desc">
                答案的每个重要论断、每组敏感数据都会被打上高亮引用角标（CitationBadge）。悬停即可快速预览匹配的原始 Chunk 文字，点击可快速在右侧滑出溯源抽屉（CitationDrawer），直接调阅本地文档。
              </p>
              <ul className="feature-bullets">
                <li>精确关联至源文件（如 .pdf, .xlsx）的对应页码与坐标</li>
                <li>显示余弦相似度分数，置信度清晰明了</li>
                <li>内置校对机制，一键高亮原文在源文件中的具体段落</li>
              </ul>
            </div>
            <div className="feature-demo">
              <div className="demo-header">
                <div className="window-controls">
                  <div className="control-dot close"></div>
                  <div className="control-dot minimize"></div>
                  <div className="control-dot expand"></div>
                </div>
                <div className="window-title">citation_audit_preview.html</div>
              </div>
              <div className="demo-body" style={{ backgroundColor: "#0b0f19" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ background: "rgba(30, 41, 59, 0.3)", border: "1px solid var(--lp-border-color)", padding: "1rem", borderRadius: "8px" }}>
                    <p className="qa-answer" style={{ fontSize: "0.85rem", textAlign: "left" }}>
                      根据我们本地财务指南，所有季度销售预算明细在本地同步前，必须先经过本地 RAG 引擎的二次脱敏过滤。
                      <span
                        className="citation-badge"
                        onMouseEnter={() => setActiveCitationPopup(1)}
                        onMouseLeave={() => setActiveCitationPopup(null)}
                      >
                        [1]
                      </span>
                      同时，系统默认存储时效为 90 天，到期后将由 Air-gapped 磁盘清理器彻底粉碎。
                      <span
                        className="citation-badge"
                        onMouseEnter={() => setActiveCitationPopup(2)}
                        onMouseLeave={() => setActiveCitationPopup(null)}
                      >
                        [2]
                      </span>
                    </p>
                  </div>

                  {/* Popups */}
                  {activeCitationPopup === 1 && (
                    <div className="citation-popup" id="demo-popup-1" style={{ display: "block", opacity: 0.95 }}>
                      <div className="source-file">📂 docs/confidential/sales_q4_finance.pdf (页码: 14)</div>
                      <div className="source-excerpt">
                        “RAG 检索前置策略：凡带有高保密密级标记的数据包，必须在进入向量切片（Chunking）前自动剔除财务姓名与明细。” - 置信度: 94.6%
                      </div>
                    </div>
                  )}

                  {activeCitationPopup === 2 && (
                    <div className="citation-popup" id="demo-popup-2" style={{ display: "block", opacity: 0.95 }}>
                      <div className="source-file">📂 docs/compliance/local_policy.md (行号: 242)</div>
                      <div className="source-excerpt">
                        “对于本地部署节点，所有内存、临时磁盘中的向量切片片段在不活跃 90 天后自动触发完全物理清空。” - 置信度: 89.2%
                      </div>
                    </div>
                  )}
                  <p style={{ fontSize: "0.7rem", color: "var(--lp-text-dark)", textAlign: "center" }}>
                    将鼠标悬停在上方高亮的 [1] 或 [2] 引用标签上查看精确原文出处
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 4: Model Portability */}
          <div className="feature-row reverse">
            <div className="feature-info">
              <div className="feature-badge">PORTABILITY & COMPATIBILITY</div>
              <h3 className="feature-title">多模型适配 · 拒绝任何厂商锁定</h3>
              <p className="feature-desc">
                真正的技术主权意味着选择的自由。mindvaults 极简适配本地模型平台 Ollama，同时也支持加密代理连接第三方安全商业大模型。
              </p>
              <ul className="feature-bullets">
                <li>一键绑定运行在本地的 DeepSeek-R1、Qwen2.5 或者是 Llama3</li>
                <li>内置硬件 VRAM 自动评估器，自动推荐合适的量化密级（Q4/Q8）</li>
                <li>极速热切换：问答过程中可随时秒级切换后端推理大脑</li>
              </ul>
            </div>
            <div className="feature-demo">
              <div className="demo-header">
                <div className="window-controls">
                  <div className="control-dot close"></div>
                  <div className="control-dot minimize"></div>
                  <div className="control-dot expand"></div>
                </div>
                <div className="window-title">hardware_vram_estimation.go</div>
              </div>
              <div className="demo-body" style={{ backgroundColor: "#0b0f19" }}>
                <div className="model-swap-tabs">
                  <button className={`model-tab ${activeModel === "ds" ? "active" : ""}`} onClick={() => setActiveModel("ds")}>
                    DeepSeek-R1 (8B)
                  </button>
                  <button className={`model-tab ${activeModel === "qw" ? "active" : ""}`} onClick={() => setActiveModel("qw")}>
                    Qwen-2.5 (14B)
                  </button>
                  <button className={`model-tab ${activeModel === "ll" ? "active" : ""}`} onClick={() => setActiveModel("ll")}>
                    Llama-3 (8B)
                  </button>
                </div>

                <div className="diagnostic-panel">
                  <div className="metric-card">
                    <div className="metric-label">本地显存占用 (VRAM)</div>
                    <div className="metric-value">{activeMetrics.vram}</div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: activeMetrics.barVram }}></div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">生成耗时/速度</div>
                    <div className="metric-value">{activeMetrics.speed}</div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill cyan" style={{ width: activeMetrics.barSpeed }}></div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">硬件占用预估</div>
                    <div className="metric-value">{activeMetrics.cpu}</div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill mint" style={{ width: activeMetrics.barCpu }}></div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">物理连接状态</div>
                    <div className="metric-value" style={{ color: "var(--lp-active-mint)" }}>
                      100% OFFLINE
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill mint" style={{ width: "100%" }}></div>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--lp-text-dark)", textAlign: "center", marginTop: "1rem" }}>
                  点击上方不同模型标签，查看其本地硬件负载预估
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ONBOARDING SECTION */}
      <section id="onboarding" className="onboarding-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 className="lp-section-title">五分钟，搭建您的专属私有智库</h2>
            <p className="lp-section-desc" style={{ margin: "0 auto" }}>
              mindvaults 遵循极简部署规范，只需极少前置步骤即可开始体验。
            </p>
          </div>

          <div className="onboarding-flow">
            <div className="steps-grid">
              {/* Step 1 */}
              <div className="step-card">
                <div className="step-num">01</div>
                <h4 className="step-title">运行 Docker 镜像</h4>
                <p>
                  复制并在您的终端下运行这一行 docker compose 命令。它会自动在您的机器上拉起并连接 Web 前端、FastAPI 后端和 pgvector 容器群。
                </p>
                <div className="step-cli-block">
                  <span id="cli-cmd">docker compose up -d</span>
                  <button className="copy-btn" onClick={copyCliCommand} title="复制命令">
                    <svg viewBox="0 0 24 24" style={{ width: "14px", height: "14px", fill: "currentColor" }}>
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Step 2 */}
              <div className="step-card">
                <div className="step-num">02</div>
                <h4 className="step-title">绑定本地文件目录</h4>
                <p>
                  登录本地运行的前端控制台。简单在“知识库”面板拖拽上传或者指向本地的加密文档文件夹，系统会自动启动无害解析并切片向量化。
                </p>
              </div>
              {/* Step 3 */}
              <div className="step-card">
                <div className="step-num">03</div>
                <h4 className="step-title">热连接本地 Ollama</h4>
                <p>
                  启动您电脑后台常驻的 Ollama 平台，或者直接输入一个可信任的企业内部大模型 API Key。系统会自动侦测并建立握手。
                </p>
              </div>
              {/* Step 4 */}
              <div className="step-card">
                <div className="step-num">04</div>
                <h4 className="step-title">开始高智感本地问答</h4>
                <p>
                  现在，您可以在简洁的聊天界面进行提问了。每一个回答均伴随完整的“思维指示流”及原文“溯源角标”，感受主权与高智感的完美交融。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OPEN SOURCE ADVANTAGES */}
      <section id="opensource" className="opensource-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <h2 className="lp-section-title">开源，是为了更绝对的技术主权</h2>
            <p className="lp-section-desc" style={{ margin: "0 auto" }}>
              mindvaults 坚信：只有完全开源的技术栈，才能真正保护您的数据资产不被窃用与滥用。
            </p>
          </div>

          <div className="opensource-grid">
            <div className="os-card">
              <div className="os-icon">🏠</div>
              <div>
                <h4 className="os-title">自托管一切 (Self-Hosted)</h4>
                <p className="os-desc">
                  我们不提供任何将您数据传上云的逻辑。无论是在普通的 M1 Mac、本地群晖 NAS、树莓派，还是在私有企业 GPU 机房，都能一键独立启动。
                </p>
              </div>
            </div>
            <div className="os-card">
              <div className="os-icon">🔑</div>
              <div>
                <h4 className="os-title">免除任何商业锁定</h4>
                <p className="os-desc">
                  任意切换向量库、底层文件解析包及推理模型提供商。我们是彻底的模块化架构设计，拒绝任何排他性的专有闭源协议。
                </p>
              </div>
            </div>
            <div className="os-card">
              <div className="os-icon">🔬</div>
              <div>
                <h4 className="os-title">完全透明、开箱即审</h4>
                <p className="os-desc">
                  没有隐藏的遥测数据，没有秘密的网络回传。整个系统代码完全开放审计，随时欢迎安全团队进行合规测试和本地网络流量监控。
                </p>
              </div>
            </div>
            <div className="os-card">
              <div className="os-icon">🤝</div>
              <div>
                <h4 className="os-title">活跃的社区共建机制</h4>
                <p className="os-desc">
                  与全球开发者共同开发，支持由社区源源不断贡献的定制化 PDF/Word 解析器，及针对垂直金融、医疗、法律场景的自定义 RAG 检索微调插件。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ ACCORDIONS */}
      <section id="faq" className="faq-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <h2 className="lp-section-title">常见问题解答 (FAQ)</h2>
            <p className="lp-section-desc" style={{ margin: "0 auto" }}>
              为您梳理关于本地部署、硬件开销及安全机制的各种核心解答。
            </p>
          </div>

          <div className="faq-list">
            {/* FAQ 1 */}
            <div className={`faq-item ${activeFaq === 1 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(1)}>
                <span>MindVault 支持解析哪些本地文件格式？</span>
                <span className="faq-arrow">{activeFaq === 1 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 1 ? "200px" : "0" }}>
                <p>
                  我们内置了极其鲁棒的多模态解析引擎，开箱即支持：PDF（内置文本流解析与自动双栏检测）、Markdown、Word（.docx）、Excel（.xlsx）、PPT（.pptx）、TXT、JSON 及 HTML。对于包含图片或非结构化扫描版 PDF，系统会自动调用本地轻量 OCR 进行文本抽取，无需依赖外部云服务。
                </p>
              </div>
            </div>

            {/* FAQ 2 */}
            <div className={`faq-item ${activeFaq === 2 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(2)}>
                <span>我的敏感文档绝对安全吗？任何时候会请求外部互联网吗？</span>
                <span className="faq-arrow">{activeFaq === 2 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 2 ? "200px" : "0" }}>
                <p>
                  在完全本地（Ollama + 本地 pgvector）的运行模式下，系统在任何时间、任何场景都不会发起任何对外网的网络请求。整个问答、词向量嵌入和数据检索均在您的局域网甚至物理隔离单机内闭环运行。在启动 Docker 时，您甚至可以直接切断网络，验证系统依然可以毫无阻碍地离线运作。
                </p>
              </div>
            </div>

            {/* FAQ 3 */}
            <div className={`faq-item ${activeFaq === 3 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(3)}>
                <span>本地化部署 mindvaults 的最低与推荐硬件配置是多少？</span>
                <span className="faq-arrow">{activeFaq === 3 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 3 ? "240px" : "0" }}>
                <p>
                  如果您选择使用在线 API（如仅使用 pgvector 进行本地存储检索，将数据加密发送至 OpenAI/DeepSeek 商业 API），则几乎不消耗显存，1核 2G 内存即可极速运行。
                  <br />
                  如果您选择完全 100% 本地大模型推理（如拉起 DeepSeek-R1-8B 或者是 Llama3-8B）：推荐电脑配备 Apple M系列芯片（或任何搭载 8GB+ 显存 Nvidia 显卡的主机），搭配 16GB 统一物理内存，即可享受到 20~30 词/秒的极流畅本地运行效果。
                </p>
              </div>
            </div>

            {/* FAQ 4 */}
            <div className={`faq-item ${activeFaq === 4 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(4)}>
                <span>与直接使用 ChatGPT / Claude 网页端的文档上传相比，mindvaults 优势在哪？</span>
                <span className="faq-arrow">{activeFaq === 4 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 4 ? "240px" : "0" }}>
                <p>
                  主要有三大核心优势：
                  <br />
                  1. <strong>数据主权</strong>：上传至商业 AI 平台的文档会被其收集、归档甚至作为未来的训练集，存在泄密风险。而 mindvaults 保证数据 100% 自控。
                  <br />
                  2. <strong>高精溯源</strong>：商业大模型对于长文档往往通过“黑盒总结”，经常发生幻觉。mindvaults 精确展现引用来源，标明原文页码和相似度分数，支持随时校对审核。
                  <br />
                  3. <strong>本地知识复用</strong>：支持一次索引，多人协作。您可以部署在办公室局域网，全团队即可安全无缝共享知识资产。
                </p>
              </div>
            </div>

            {/* FAQ 5 */}
            <div className={`faq-item ${activeFaq === 5 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(5)}>
                <span>如何添加或切换不同的开源本地大模型？</span>
                <span className="faq-arrow">{activeFaq === 5 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 5 ? "200px" : "0" }}>
                <p>
                  极简。只要您在本地或同局域网的机器上启动 Ollama，在终端运行类似 `ollama run deepseek-r1:8b` 下载您想运行的大模型。mindvaults 前端控制台会自动扫描并同步列出当前所有可用的 Ollama 大脑模型，您只需在对话框顶部轻松下拉即可一键切换。
                </p>
              </div>
            </div>

            {/* FAQ 6 */}
            <div className={`faq-item ${activeFaq === 6 ? "active" : ""}`}>
              <button className="faq-trigger" onClick={() => toggleFaq(6)}>
                <span>团队版或局域网共享知识库如何实现？</span>
                <span className="faq-arrow">{activeFaq === 6 ? "－" : "＋"}</span>
              </button>
              <div className="faq-content" style={{ maxHeight: activeFaq === 6 ? "240px" : "0" }}>
                <p>
                  当您在本地一台性能较好的主机（如公司局域网服务器或工作站）部署完成后，系统前端控制台支持配置团队账户体系。您可以分配给财务、研发或行政不同权限级别的 API 密钥或账户。他们可以通过局域网 IP（例如 `http://192.168.1.100:3000`）共同访问这台主机上的共享向量金库，实现局域网内协同高智感办公。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA SECTION */}
      <section className="cta-section">
        <div className="lp-container">
          <h2>准备好拿回您宝贵的数据主权了吗？</h2>
          <p>无需繁复配置，轻量容器部署，构建完全属于您自己的私有智库金库。</p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/chat" className="lp-btn lp-btn-primary" style={{ padding: "1rem 2rem", fontSize: "1rem" }}>
              🚀 立即进入控制台 (免费体验)
            </Link>
            <a href="https://github.com/sqking-coke/mindvaults" target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-secondary" style={{ padding: "1rem 2rem", fontSize: "1rem" }}>
              <svg viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "currentColor", verticalAlign: "middle", marginRight: "4px" }}>
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="footer-grid">
            {/* Brand / description column */}
            <div className="footer-brand-col">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ffffff", fontWeight: 800 }}>
                <svg className="lp-logo-polygon" viewBox="0 0 24 24" style={{ width: "22px", height: "22px" }}>
                  <polygon points="12,2 14.5,8.5 21,11 14.5,13.5 12,20 9.5,13.5 3,11 9.5,8.5" fill="none" stroke="#60a5fa" strokeWidth="2" />
                  <circle cx="12" cy="11" r="2.5" fill="#60a5fa" />
                </svg>
                <span style={{ fontSize: "1.2rem", letterSpacing: "-0.02em" }}>mindvaults</span>
              </div>
              <p className="footer-brand-desc">
                安全优先的本地 AI RAG 知识库问答系统。开源、完全自托管、为绝对的数据主权而建。
              </p>
              <div className="footer-socials">
                <a href="#" className="social-icon-link" title="X (Twitter)">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
                  </svg>
                </a>
                <a href="https://github.com/sqking-coke/mindvaults" className="social-icon-link" title="GitHub" target="_blank" rel="noopener noreferrer">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                </a>
              </div>
              <Link href="/chat" className="btn-footer-pill">
                开始使用
              </Link>
            </div>

            {/* Sitemap 1 */}
            <div className="footer-links-col">
              <span className="footer-col-title">产品</span>
              <ul className="footer-links-list">
                <li className="footer-link-item"><a href="#features">核心特性</a></li>
                <li className="footer-link-item"><a href="#onboarding">部署指南</a></li>
                <li className="footer-link-item"><a href="#opensource">开源优势</a></li>
                <li className="footer-link-item"><a href="#faq">常见问题</a></li>
                <li className="footer-link-item"><Link href="/changelog">更新日志</Link></li>
              </ul>
            </div>

            {/* Sitemap 2 */}
            <div className="footer-links-col">
              <span className="footer-col-title">资源</span>
              <ul className="footer-links-list">
                <li className="footer-link-item"><a href="#onboarding">技术文档</a></li>
                <li className="footer-link-item"><a href="#onboarding">Ollama 连接</a></li>
                <li className="footer-link-item"><a href="#onboarding">Docker 部署</a></li>
                <li className="footer-link-item"><a href="#onboarding">API 接口</a></li>
              </ul>
            </div>

            {/* Sitemap 3 */}
            <div className="footer-links-col">
              <span className="footer-col-title">关于</span>
              <ul className="footer-links-list">
                <li className="footer-link-item"><a href="#features">数据主权</a></li>
                <li className="footer-link-item"><a href="#features">隐私安全</a></li>
                <li className="footer-link-item"><a href="https://github.com/sqking-coke/mindvaults" target="_blank" rel="noopener noreferrer">Github 源码</a></li>
                <li className="footer-link-item"><a href="#opensource">联系团队</a></li>
              </ul>
            </div>
          </div>

          <hr className="footer-divider-line" />

          <div className="footer-bottom-row">
            <span>© 2026 mindvaults. 保留所有权利。</span>
            <div className="lang-selector">
              <a href="#" className="lang-link">EN</a>
              <span>|</span>
              <a href="#" className="lang-link active">中文</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
