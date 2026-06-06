"use client";

import React, { useState, useRef, useEffect } from "react";
import { Tag, X } from "lucide-react";

interface ConceptHoverCardProps {
  name: string;
  summary: string;
  children: React.ReactNode;
}

/**
 * 概念术语 hover 卡片 — 在聊天回答中内联展示术语，hover 时弹出定义卡片。
 *
 * 对齐设计文档 18-概念术语关联 的「连接点② — 前端 hover 卡片」。
 */
export default function ConceptHoverCard({ name, summary, children }: ConceptHoverCardProps) {
  const [show, setShow] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 桌面端 hover 延迟显示
  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  };
  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShow(false), 200);
  };

  // 移动端点击切换
  const handleClick = () => {
    setMobileOpen((v) => !v);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const isVisible = show || mobileOpen;

  return (
    <span className="relative inline" ref={triggerRef}>
      {/* 术语内联样式 */}
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="cursor-help border-b border-dashed border-indigo-400 text-indigo-700 font-medium hover:bg-indigo-50/60 transition-colors rounded-sm px-0.5"
        title={summary}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShow((v) => !v);
          }
        }}
        aria-expanded={isVisible}
      >
        {children}
      </span>

      {/* Hover 弹出卡片 */}
      {isVisible && (
        <div
          ref={cardRef}
          className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 animate-fade-in"
          onMouseEnter={() => clearTimeout(timeoutRef.current)}
          onMouseLeave={handleMouseLeave}
        >
          {/* 卡片头部 */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-bold text-slate-700">{name}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShow(false);
                setMobileOpen(false);
              }}
              className="text-slate-300 hover:text-slate-500 transition-colors"
              aria-label="关闭概念卡片"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 概念摘要 */}
          <div className="px-4 pb-3">
            <p className="text-xs text-slate-500 leading-relaxed">{summary}</p>
          </div>

          {/* 底部箭头指示器 */}
          <div className="absolute left-4 -bottom-1.5 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45" />
        </div>
      )}
    </span>
  );
}

/**
 * 从复合概念名（如 "自然语言转SQL (NL2SQL)"）中提取所有可匹配的独立术语。
 * 拆分为：全名、括号内的英文缩写、括号外的主体名、以及所有别名。
 */
function getMatchableTerms(concept: { name: string; summary: string; aliases?: string[] }): string[] {
  const terms = new Set<string>();
  terms.add(concept.name);

  // 从别名添加
  if (concept.aliases) {
    for (const alias of concept.aliases) {
      if (alias && alias.trim()) terms.add(alias.trim());
    }
  }

  // 拆分复合名称 "主体 (英文)" 或 "主体（中文）"
  const compositeMatch = concept.name.match(/^(.+?)\s*[\(（]([^\)）]+)[\)）]$/);
  if (compositeMatch) {
    const main = compositeMatch[1].trim();
    const sub = compositeMatch[2].trim();
    if (main) terms.add(main);
    if (sub) terms.add(sub);
  }

  // 过滤掉长度 < 2 的术语（如单字母）
  return Array.from(terms).filter((t) => t.length >= 2);
}

/**
 * 在文本中识别概念术语并渲染为 hover 卡片。
 *
 * 匹配策略：
 * 1. 从概念名 + 别名 + 复合名拆分中提取所有可匹配术语
 * 2. 按术语长度降序排列（优先匹配长术语，避免短术语误吞长前缀）
 * 3. 仅在完整词边界匹配（术语前后不能是字母/数字/中文）
 */
export function renderWithConcepts(
  text: string,
  concepts: { name: string; summary: string; aliases?: string[] }[],
): React.ReactNode {
  if (!concepts || concepts.length === 0) {
    return text;
  }

  // 构建 term → concept 映射（同一 term 只保留第一个 concept）
  const termMap = new Map<string, { name: string; summary: string }>();
  const allTerms: string[] = [];

  for (const c of concepts) {
    const terms = getMatchableTerms(c);
    for (const t of terms) {
      if (!termMap.has(t.toLowerCase())) {
        termMap.set(t.toLowerCase(), { name: c.name, summary: c.summary });
        allTerms.push(t);
      }
    }
  }

  // 按长度降序排列
  allTerms.sort((a, b) => b.length - a.length);

  // 构建正则 — 要求词边界（术语前后不能是 alphanumeric 或中文）
  const escaped = allTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(pattern);
  if (parts.length <= 1) {
    return text;
  }

  return (
    <>
      {parts.map((part, i) => {
        const matched = termMap.get(part.toLowerCase());
        if (matched) {
          return (
            <ConceptHoverCard key={i} name={matched.name} summary={matched.summary}>
              {part}
            </ConceptHoverCard>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
