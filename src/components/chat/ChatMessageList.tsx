"use client";

import React, { useRef, useEffect, useState } from "react";
import { usemindvaults, Message, Citation } from "@/context/mindvaultsContext";
import {
  Sparkles,
  ChevronRight,
  CheckCircle,
  HelpCircle,
  Clock,
  User,
  Bot,
  Share2,
  Brain
} from "lucide-react";
import { fetchFrequentQuestions } from "@/services/ragService";
import KnowledgeCard from "./KnowledgeCard";
import WechatExport from "./WechatExport";

interface ChatMessageListProps {
  onSelectTemplate: (text: string) => void;
}

export default function ChatMessageList({ onSelectTemplate }: ChatMessageListProps) {
  const { 
    conversations, 
    activeConversationId, 
    isGenerating, 
    setSelectedCitation 
  } = usemindvaults();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sharingCard, setSharingCard] = useState<{
    question: string;
    answer: string;
    citations: Citation[];
  } | null>(null);

  const [wechatExportData, setWechatExportData] = useState<{
    question: string;
    answer: string;
    citations: Citation[];
  } | null>(null);

  const [collapsedThinkings, setCollapsedThinkings] = useState<Set<string>>(new Set());

  // 打字机动效：生成中的最后一条 assistant 消息逐字展示
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [typewriterPos, setTypewriterPos] = useState(0);

  // 高频问题（Top-3 动态模板）
  const [frequentQuestions, setFrequentQuestions] = useState<Array<{ question: string; count: number }>>([]);
  useEffect(() => {
    fetchFrequentQuestions(3)
      .then((data) => setFrequentQuestions(data.items.map((q) => ({ question: q.question, count: q.count }))))
      .catch(() => {});
  }, []);

  // Find active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const lastAssistantMsg = activeConversation?.messages
    .filter(m => m.role === "assistant")
    .slice(-1)[0];

  // 打字机动效控制器：只在 isGenerating 变化时启动/停止，不因内容增长重启
  const fullLenRef = useRef(0);
  useEffect(() => {
    fullLenRef.current = lastAssistantMsg?.content?.length || 0;
  });

  useEffect(() => {
    if (!isGenerating) {
      setTypewriterPos(0);
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
      return;
    }

    typewriterRef.current = setInterval(() => {
      setTypewriterPos(prev => {
        if (prev >= fullLenRef.current) return prev;
        return prev + 1;
      });
    }, 25);

    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [isGenerating]);

  // Auto-scroll to bottom of messages
  const lastMessageContentLength = activeConversation?.messages?.[activeConversation.messages.length - 1]?.content?.length || 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages?.length, lastMessageContentLength]);

  // 固定兜底模板（按需补齐到 6 条）
  const fixedTemplates = [
    { label: "系统架构提问", text: "请问 mindvaults 的底层架构是怎么设计的？它是怎么保障私有数据的安全问答的？", icon: "⚡" },
    { label: "弹性考勤查询", text: "我想知道公司的考勤和假期规定，核心工作时间段是什么时候？年假有几天？", icon: "📅" },
    { label: "混合向量检索", text: "解释一下 mindvaults 的向量嵌入 Embedding 与重排 Reranking 检索过滤原理。", icon: "🔍" },
    { label: "研发接口标准", text: "研发团队对于 RESTful API 接口的命名路径、异常响应体以及幂等性设计有什么具体规范要求？", icon: "💻" },
    { label: "个人原子习惯", text: "在个人工作习惯重建中，如何具体运用原子习惯的四个核心环路，并结合卡片笔记来沉淀认知？", icon: "📝" },
    { label: "文档导入指南", text: "如何批量导入 PDF、Word 和 Markdown 文档到知识库中？支持哪些文件格式？", icon: "📂" },
  ];

  // 混合模板：前 N 条动态（高频 Top1~Top3），不足 6 条用固定模板补齐
  const dynamicCount = frequentQuestions.length;
  const fillCount = Math.max(0, 6 - dynamicCount);
  const promptTemplates = [
    ...frequentQuestions.map((q, i) => ({
      label: `🔥 高频提问 Top${i + 1}`,
      text: q.question,
      icon: "📈",
    })),
    ...fixedTemplates.slice(0, fillCount),
  ];

  // Helper: Parse message text to find citation numbers like [1] or [2] and render them as interactive tags
  const renderMessageContent = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
    }

    // Match [1], [2], [3]...
    const parts = content.split(/(\[\d+\])/g);
    return (
      <div className="whitespace-pre-wrap leading-relaxed select-text">
        {parts.map((part, index) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const citIndex = parseInt(match[1], 10);
            const citation = citations.find(c => c.index === citIndex);
            
            if (citation) {
              return (
                <button
                  key={index}
                  onClick={() => setSelectedCitation(citation)}
                  className="mx-0.5 inline-flex items-center justify-center h-5 px-1.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 font-mono text-[10px] font-bold hover:bg-indigo-100 hover:border-indigo-300 hover:text-indigo-700 transition-colors align-middle focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  title={`点击查看溯源: ${citation.docName}`}
                  aria-label={`查看第 ${citation.page || 1} 页的引用溯源: ${citation.docName}`}
                >
                  [{citIndex}]
                </button>
              );
            }
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 bg-slate-50/50">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {!activeConversation || activeConversation.messages.length === 0 ? (
          /* Welcome Page / No conversations */
          <div className="py-8 md:py-12 space-y-8 animate-fade-in select-none">
            <div className="text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mx-auto">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">mindvaults 智能问答沙盒</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                本地离线大语言模型驱动，安全解析您的文档资产。支持多格式解析、高精度向量相似度定位与引用溯源展示。
              </p>
            </div>

            {/* Suggested Prompts Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                建议开始的提问模板
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {promptTemplates.map((tmpl, idx) => (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => !isGenerating && onSelectTemplate(tmpl.text)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !isGenerating) {
                        e.preventDefault();
                        onSelectTemplate(tmpl.text);
                      }
                    }}
                    aria-label={`一键填充提问模板: ${tmpl.label}`}
                    className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-500/5 cursor-pointer p-4 rounded-xl transition-all duration-200 text-left group flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  >
                    <div>
                      <span className="text-lg mb-2 block">{tmpl.icon}</span>
                      <h4 className="font-semibold text-slate-800 text-xs group-hover:text-indigo-600 transition-colors">
                        {tmpl.label}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-1 line-clamp-3">
                        "{tmpl.text}"
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-end text-[10px] text-indigo-500 font-bold group-hover:translate-x-1 transition-transform">
                      一键填充 <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Micro instructions */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 bg-white border border-slate-150 p-4 rounded-xl shadow-sm max-w-xl mx-auto">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                BGE Embedding
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                HNSW 向量库
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                BCE Reranker
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                本地 LLM 推理
              </span>
            </div>
          </div>
        ) : (
          /* Message List rendering */
          <div className="space-y-6">
            {activeConversation.messages.map((msg, idx) => {
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 md:gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {/* Left Avatar for Assistant */}
                  {!isUser && (
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow shadow-indigo-500/10 shrink-0">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`max-w-[85%] space-y-2.5 ${isUser ? "order-1" : "order-2"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isUser
                          ? "bg-indigo-600 text-white font-medium rounded-tr-none"
                          : "bg-white border border-slate-150 text-slate-800 rounded-tl-none leading-relaxed"
                      }`}
                    >
                      {/* RAG 推理过程 Accordion */}
                      {!isUser && msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                        <div className="mb-3 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                          <button
                            onClick={() => {
                              setCollapsedThinkings(prev => {
                                const next = new Set(prev);
                                if (next.has(msg.id)) next.delete(msg.id);
                                else next.add(msg.id);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-1.5">
                              <Brain className="h-3.5 w-3.5" />
                              RAG 推理过程
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {collapsedThinkings.has(msg.id) ? "展开 ▼" : "收起 ▲"}
                            </span>
                          </button>
                          {!collapsedThinkings.has(msg.id) && (
                            <div className="px-3 pb-2.5 flex flex-col gap-1">
                              {msg.thinkingSteps.map((step, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-[10px] leading-relaxed"
                                  style={{
                                    color: step.phase === "intent" ? "#6366f1"
                                         : step.phase === "retrieval" ? "#2563eb"
                                         : step.phase === "matching" ? "#059669"
                                         : "#7c3aed"
                                  }}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{
                                      background: step.phase === "intent" ? "#6366f1"
                                                : step.phase === "retrieval" ? "#3b82f6"
                                                : step.phase === "matching" ? "#10b981"
                                                : "#8b5cf6"
                                    }}
                                  />
                                  <span>{step.text}</span>
                                  {step.elapsed_ms != null && (
                                    <span className="text-[9px] text-slate-400 ml-auto shrink-0">{step.elapsed_ms}ms</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rich parsing and inline citation rendering */}
                      {isUser ? (
                        <div className="whitespace-pre-wrap select-text">{msg.content}</div>
                      ) : isGenerating && msg.id === lastAssistantMsg?.id ? (
                        renderMessageContent(msg.content.slice(0, typewriterPos), msg.citations)
                      ) : (
                        renderMessageContent(msg.content, msg.citations)
                      )}
                    </div>

                    {/* Citation Source list Cards (At the bottom of Assistant responses) */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="space-y-1.5 pl-1.5 animate-fade-in select-none">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          参考引用来源 ({msg.citations.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((cit) => (
                            <div
                              key={cit.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedCitation(cit)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedCitation(cit);
                                }
                              }}
                              className="bg-white border border-slate-150 hover:border-indigo-300 hover:bg-slate-50/50 cursor-pointer p-2 rounded-lg flex items-center gap-2 max-w-xs transition-all duration-150 group focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                              title="点击查看此溯源切片原文"
                              aria-label={`查看引用来源 [${cit.index}]: ${cit.docName}`}
                            >
                              <div className="h-6 w-6 rounded bg-indigo-50 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-indigo-600 font-mono">[{cit.index}]</span>
                              </div>
                              <div className="overflow-hidden pr-1">
                                <span className="text-[11px] font-semibold text-slate-700 block truncate group-hover:text-indigo-600 transition-colors">
                                  {cit.docName}
                                </span>
                                <span className="text-[9px] text-slate-400 block font-mono">
                                  第 {cit.page || 1} 页 • 相似度 {(cit.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp underlay */}
                    <div className={`flex items-center gap-3 text-[10px] text-slate-400 ${isUser ? "justify-end pr-1" : "pl-1.5"}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{msg.timestamp}</span>
                      </div>
                      {!isUser && msg.content.length > 20 && (
                        <>
                          <button
                            onClick={() => {
                              const prevMsg = activeConversation.messages[idx - 1];
                              const questionText = prevMsg && prevMsg.role === "user" ? prevMsg.content : "关于 mindvaults 的提问";
                              setSharingCard({
                                question: questionText,
                                answer: msg.content,
                                citations: msg.citations || [],
                              });
                            }}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium transition-colors cursor-pointer select-none border-none bg-transparent p-0"
                            title="生成分享知识卡片"
                            aria-label="生成分享知识卡片"
                          >
                            <Share2 className="h-3 w-3 text-indigo-500" />
                            <span>分享卡片</span>
                          </button>

                          <button
                            onClick={() => {
                              const prevMsg = activeConversation.messages[idx - 1];
                              const questionText = prevMsg && prevMsg.role === "user" ? prevMsg.content : "关于 mindvaults 的提问";
                              setWechatExportData({
                                question: questionText,
                                answer: msg.content,
                                citations: msg.citations || [],
                              });
                            }}
                            className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-medium transition-colors cursor-pointer select-none border-none bg-transparent p-0"
                            title="微信公众号优雅排版导出"
                            aria-label="微信公众号优雅排版导出"
                          >
                            <svg className="h-3 w-3 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8.5,13.5A1.5,1.5 0 0,1 7,12A1.5,1.5 0 0,1 8.5,10.5A1.5,1.5 0 0,1 10,12A1.5,1.5 0 0,1 8.5,13.5M15.5,13.5A1.5,1.5 0 0,1 14,12A1.5,1.5 0 0,1 15.5,10.5A1.5,1.5 0 0,1 17,12A1.5,1.5 0 0,1 15.5,13.5M12,2A10,10 0 0,0 2,12C2,14.65 3,17.06 4.7,18.9L3.3,21.7C3.13,22.04 3.26,22.45 3.6,22.61C3.7,22.66 3.82,22.7 3.93,22.7C4.17,22.7 4.4,22.56 4.5,22.33L6.14,19.05C7.81,20.27 9.83,21 12,21A10,10 0 0,0 22,11A10,10 0 0,0 12,2M12,20C10.15,20 8.44,19.38 7.05,18.35L6.85,18.2L6.6,18.7L5.5,20.9L6.5,18.9L6.6,18.7L6.4,18.52C4.9,17 4,14.94 4,12C4,7.58 7.58,4 12,4C16.42,4 20,7.58 20,12C20,16.42 16.42,20 12,20Z" />
                            </svg>
                            <span>微信导出</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Avatar for User */}
                  {isUser && (
                    <div className="h-9 w-9 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 shrink-0 shadow-sm">
                      <User className="h-5 w-5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Simulated Loading Indicator for typing streaming */}
            {isGenerating && (
              <div className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow shadow-indigo-500/10 shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <div className="bg-white border border-slate-150 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-800 shadow-sm min-w-[80px] flex items-center justify-center gap-1.5 select-none">
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" />
                  </div>
                  <span className="text-[10px] text-slate-400 animate-pulse pl-1.5 block">本地模型正在检索并组织语言...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}

      </div>

      {sharingCard && (
        <KnowledgeCard
          question={sharingCard.question}
          answer={sharingCard.answer}
          citations={sharingCard.citations}
          onClose={() => setSharingCard(null)}
        />
      )}

      {wechatExportData && (
        <WechatExport
          question={wechatExportData.question}
          answer={wechatExportData.answer}
          citations={wechatExportData.citations}
          onClose={() => setWechatExportData(null)}
        />
      )}
    </div>
  );
}
