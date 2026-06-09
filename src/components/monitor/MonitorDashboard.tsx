"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fetchMonitorDashboard, fetchAlertConfig, updateAlertConfig, resolveAlert, resolveAllAlerts } from "@/services/ragService";
import type { DashboardData, AlertConfig, RouteMetrics, LLMMetrics } from "@/types/api";

// ── 子组件 ────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 hover:border-slate-600/60 transition-colors">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-100 mt-1 flex items-center gap-2">
        {value}
        {trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-400" />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-emerald-400" />}
        {trend === "flat" && <span className="text-sm text-slate-500">→</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function AlertsPanel({
  alerts,
  onDismiss,
}: {
  alerts: DashboardData["active_alerts"];
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 按 category 分组计数
  const catCounts: Record<string, number> = {};
  alerts.forEach((a) => {
    catCounts[a.category] = (catCounts[a.category] || 0) + 1;
  });

  const catLabels: Record<string, { label: string; color: string }> = {
    routing: { label: "路由", color: "text-red-400" },
    concept: { label: "概念", color: "text-amber-400" },
    health: { label: "健康", color: "text-orange-400" },
    insight: { label: "提炼", color: "text-yellow-400" },
    external: { label: "推送", color: "text-rose-400" },
    system: { label: "系统", color: "text-red-400" },
  };

  const handleDismissOne = async (e: React.MouseEvent, eventId: number) => {
    e.stopPropagation();
    try {
      await resolveAlert(eventId);
      onDismiss();
    } catch { /* ignore */ }
  };

  const handleDismissAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await resolveAllAlerts();
      onDismiss();
    } catch { /* ignore */ }
  };

  const visibleAlerts = expanded ? alerts : alerts.slice(0, 2);

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
      {/* Header bar — always visible */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 min-w-0 hover:opacity-80"
        >
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs font-semibold text-red-300">
              {alerts.length} 条活跃告警
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(catCounts).map(([cat, count]) => (
              <span
                key={cat}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-300/80 font-medium"
              >
                {catLabels[cat]?.label || cat} {count}
              </span>
            ))}
          </div>
        </button>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <span
            onClick={handleDismissAll}
            className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            全部已读
          </span>
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-slate-500">
            {expanded ? "收起 ▾" : "展开 ▸"}
          </button>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-slate-700/40">
          {visibleAlerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-2 text-xs border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 transition-colors group"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.status === "failed" ? "bg-red-400" : "bg-amber-400"
                }`}
              />
              <span className="text-slate-300 font-medium w-28 flex-shrink-0 truncate">
                {a.event}
              </span>
              <code className="text-[10px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded truncate">
                {a.message || a.event}
              </code>
              {a.kb_id && (
                <span className="text-[10px] text-slate-600 flex-shrink-0">
                  kb={a.kb_id}
                </span>
              )}
              <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0 mr-2">
                {new Date(a.created_at).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                onClick={(e) => handleDismissOne(e, a.id)}
                className="text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title="解除告警"
              >
                ✕
              </button>
            </div>
          ))}
          {alerts.length > 2 && (
            <div className="px-4 py-1.5 text-center text-[10px] text-slate-600 border-t border-slate-700/30">
              显示 {Math.min(visibleAlerts.length, alerts.length)} / {alerts.length} 条
            </div>
          )}
        </div>
      )}

      {/* Collapsed: show first 2 as slim preview */}
      {!expanded && alerts.length > 0 && (
        <div className="border-t border-slate-700/40">
          {alerts.slice(0, 1).map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-1.5 text-[11px] text-slate-500"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.status === "failed" ? "bg-red-400" : "bg-amber-400"
                }`}
              />
              <span className="truncate">{a.event}</span>
              <span className="text-slate-600 ml-auto flex-shrink-0">
                {new Date(a.created_at).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

export default function MonitorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [alertConfig, setAlertConfigState] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [dash, cfg] = await Promise.all([
        fetchMonitorDashboard(),
        fetchAlertConfig(),
      ]);
      setData(dash);
      setAlertConfigState(cfg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载 + 30s 轮询
  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  const handleToggleAlert = async (key: keyof AlertConfig, value: boolean) => {
    if (!alertConfig) return;
    const updated = { ...alertConfig, [key]: value };
    try {
      const result = await updateAlertConfig(updated);
      setAlertConfigState(result);
    } catch {
      // rollback on UI failure
    }
  };

  const handleUpdateThreshold = async (key: "alert_llm_route_fail_threshold" | "alert_fallback_rate_threshold" | "alert_slow_call_threshold", value: number) => {
    if (!alertConfig) return;
    const updated = { ...alertConfig, [key]: value };
    try {
      const result = await updateAlertConfig(updated);
      setAlertConfigState(result);
    } catch {
      // rollback
    }
  };

  // ── Loading / Error ──────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">加载监控数据...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{error || "数据加载失败"}</p>
          <button
            onClick={loadData}
            className="mt-3 text-xs text-indigo-400 hover:text-indigo-300"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const { route_metrics: rm, llm_metrics: lm } = data;

  const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const fmtChange = (v: number | null) => {
    if (v == null) return null;
    if (v > 0) return "up";
    if (v < 0) return "down";
    return "flat";
  };
  const fmtChangeText = (v: number | null, isPct = true) => {
    if (v == null) return "暂无昨日数据";
    const sign = v >= 0 ? "+" : "";
    return isPct ? `${sign}${(v * 100).toFixed(0)}pp vs 昨日` : `${sign}${v} vs 昨日`;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-indigo-400" />
            <h1 className="text-lg font-bold text-slate-100">监控看板</h1>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>

        {/* 活跃告警 — 折叠条 */}
        {data.active_alerts.length > 0 && (
          <AlertsPanel alerts={data.active_alerts} onDismiss={loadData} />
        )}

        {/* 指标卡 行 1: 路由 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="今日路由次数"
            value={String(rm.total_routes)}
            sub={fmtChangeText(rm.total_routes_change, false)}
            trend={rm.total_routes_change != null ? (rm.total_routes_change >= 0 ? "up" : "down") : undefined}
          />
          <MetricCard
            label="质心命中率"
            value={fmtPct(rm.centroid_hit_rate)}
            sub={fmtChangeText(rm.centroid_hit_rate_change)}
            trend={fmtChange(rm.centroid_hit_rate_change)}
          />
          <MetricCard
            label="LLM 路由率"
            value={fmtPct(rm.llm_route_rate)}
            sub={fmtChangeText(rm.llm_route_rate_change)}
            trend={fmtChange(rm.llm_route_rate_change)}
          />
          <MetricCard
            label="降级率"
            value={fmtPct(rm.fallback_rate)}
            sub={fmtChangeText(rm.fallback_rate_change)}
            trend={rm.fallback_rate_change != null ? (rm.fallback_rate_change <= 0 ? "down" : "up") : undefined}
          />
        </div>

        {/* 指标卡 行 2: LLM */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="LLM 调用次数"
            value={lm.call_count.toLocaleString()}
            sub="今日路由+提炼+概念"
          />
          <MetricCard
            label="平均调用耗时"
            value={`${lm.avg_duration.toFixed(1)}s`}
            sub={`P99: ${lm.p99_duration.toFixed(1)}s · 慢调用 ${lm.slow_call_count} 次`}
            trend={lm.p99_duration > 5 ? "up" : undefined}
          />
          <MetricCard
            label="Token 消耗 (今日)"
            value={`${((lm.token_input + lm.token_output) / 1000).toFixed(0)}K`}
            sub={`输入 ${(lm.token_input / 1000).toFixed(0)}K · 输出 ${(lm.token_output / 1000).toFixed(0)}K`}
          />
          <MetricCard
            label="LLM 可用率"
            value={fmtPct(lm.availability)}
            sub={`失败 ${lm.call_count > 0 ? Math.round(lm.call_count * (1 - lm.availability)) : 0} / 调用 ${lm.call_count}`}
            trend={lm.availability >= 0.99 ? undefined : "down"}
          />
        </div>

        {/* 趋势图: 路由效果 + Token 用量 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 路由效果趋势 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-200">路由效果趋势</h3>
              <span className="text-[10px] text-slate-600">近 7 天</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={(() => {
                  // merge series into chart data
                  const days = data.route_trend[0]?.data.map((d) => d.date) || [];
                  return days.map((date, i) => ({
                    date,
                    质心命中率: data.route_trend[0]?.data[i]?.value ?? 0,
                    LLM路由率: data.route_trend[1]?.data[i]?.value ?? 0,
                  }));
                })()}
                margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                />
                <Area
                  type="monotone"
                  dataKey="质心命中率"
                  stroke="#818cf8"
                  fill="#818cf8"
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="LLM路由率"
                  stroke="#34d399"
                  fill="#34d399"
                  fillOpacity={0.06}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Token 用量趋势 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Token 用量趋势</h3>
              <span className="text-[10px] text-slate-600">近 7 天</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={(() => {
                  const days = data.token_trend[0]?.data.map((d) => d.date) || [];
                  return days.map((date, i) => ({
                    date,
                    输入Token: data.token_trend[0]?.data[i]?.value ?? 0,
                    输出Token: data.token_trend[1]?.data[i]?.value ?? 0,
                  }));
                })()}
                margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(value: number) => value.toLocaleString()}
                />
                <Bar dataKey="输入Token" fill="#fbbf24" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="输出Token" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 耗时分布 + KB 热度 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 耗时分布 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-200">LLM 调用耗时分布</h3>
              <span className="text-[10px] text-slate-600">今日</span>
            </div>
            <div className="flex items-end gap-3 h-36 px-1">
              {data.latency_distribution.map((b) => {
                const maxCount = Math.max(...data.latency_distribution.map((x) => x.count), 1);
                const height = (b.count / maxCount) * 100;
                return (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[11px] text-slate-300 font-medium">{b.count}</span>
                    <div
                      className="w-full rounded-t-md transition-all duration-300"
                      style={{
                        height: `${Math.max(height, 2)}%`,
                        backgroundColor: b.color,
                        opacity: b.count === 0 ? 0.3 : 0.85,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KB 热度 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">KB 匹配热度（今日）</h3>
            {data.kb_hotness.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {data.kb_hotness.map((kb) => {
                  const maxCount = data.kb_hotness[0]?.count || 1;
                  const width = (kb.count / maxCount) * 100;
                  return (
                    <div key={kb.kb_id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{kb.kb_name}</span>
                        <span className="text-slate-500 font-medium">{kb.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 系统事件 + 提炼概念摘要 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 系统事件 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">系统事件（近 24h）</h3>
            <div className="space-y-2">
              {data.system_events.map((ev) => (
                <div
                  key={ev.module}
                  className="flex justify-between items-center px-3 py-2.5 bg-slate-800/40 rounded-lg"
                >
                  <div>
                    <span className="text-xs text-slate-300">{ev.module_label}</span>
                    <span className="text-[10px] text-slate-600 ml-2">{ev.module}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                      {ev.success_count}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        ev.failed_count > 0 ? "text-red-400" : "text-slate-600"
                      }`}
                    >
                      <XCircle className="h-3 w-3 inline mr-0.5" />
                      {ev.failed_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 提炼概念摘要 */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">提炼 & 概念（本周）</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-4 bg-slate-800/40 rounded-lg">
                <div className="text-2xl font-bold text-violet-400">
                  {data.insight_concept.insight_count}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">提炼知识点</div>
              </div>
              <div className="text-center p-4 bg-slate-800/40 rounded-lg">
                <div className="text-2xl font-bold text-violet-400">
                  {data.insight_concept.concept_count}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">新概念</div>
              </div>
              <div className="text-center p-4 bg-slate-800/40 rounded-lg">
                <div className="text-2xl font-bold text-emerald-400">
                  {data.insight_concept.health_score_avg}%
                </div>
                <div className="text-[10px] text-slate-500 mt-1">健康扫描得分</div>
              </div>
              <div className="text-center p-4 bg-slate-800/40 rounded-lg">
                <div className="text-2xl font-bold text-amber-400">
                  {data.insight_concept.pending_alerts}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">待处理告警</div>
              </div>
            </div>
          </div>
        </div>

        {/* 告警规则配置（可折叠） */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/40 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-300">
              🔔 告警规则配置
            </span>
            {configOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {configOpen && alertConfig && (
            <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* LLM 路由连续失败阈值 */}
              <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                <span className="text-xs text-slate-400">LLM 路由连续失败阈值</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateThreshold("alert_llm_route_fail_threshold", Math.max(1, alertConfig.alert_llm_route_fail_threshold - 1))
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold text-slate-200 w-6 text-center">
                    {alertConfig.alert_llm_route_fail_threshold}
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateThreshold("alert_llm_route_fail_threshold", alertConfig.alert_llm_route_fail_threshold + 1)
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 降级率告警阈值 */}
              <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                <span className="text-xs text-slate-400">降级率告警阈值</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateThreshold(
                        "alert_fallback_rate_threshold",
                        Math.max(0.05, +(alertConfig.alert_fallback_rate_threshold - 0.05).toFixed(2)),
                      )
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold text-slate-200">
                    {(alertConfig.alert_fallback_rate_threshold * 100).toFixed(0)}%
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateThreshold(
                        "alert_fallback_rate_threshold",
                        Math.min(1.0, +(alertConfig.alert_fallback_rate_threshold + 0.05).toFixed(2)),
                      )
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 慢调用阈值 */}
              <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                <span className="text-xs text-slate-400">慢调用阈值 (P99)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateThreshold("alert_slow_call_threshold", Math.max(1, alertConfig.alert_slow_call_threshold - 0.5))
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold text-slate-200">
                    {alertConfig.alert_slow_call_threshold}s
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateThreshold("alert_slow_call_threshold", alertConfig.alert_slow_call_threshold + 0.5)
                    }
                    className="text-slate-500 hover:text-slate-300 text-sm px-1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 开关类 */}
              {(
                [
                  { key: "alert_centroid_fail" as const, label: "质心计算失败告警" },
                  { key: "alert_external_push_fail" as const, label: "外部推送失败告警" },
                  { key: "alert_insight_batch_fail" as const, label: "提炼批处理失败告警" },
                  { key: "alert_health_scan_fail" as const, label: "健康扫描失败告警" },
                  { key: "alert_concept_extraction_fail" as const, label: "概念抽取失败告警" },
                ] as const
              ).map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5"
                >
                  <span className="text-xs text-slate-400">{label}</span>
                  <button
                    onClick={() => handleToggleAlert(key, !alertConfig[key])}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      alertConfig[key] ? "bg-emerald-500/60" : "bg-slate-600"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        alertConfig[key] ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部行间距 */}
        <div className="h-8" />
      </div>
    </div>
  );
}
