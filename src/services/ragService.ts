import type {
  KbDocument,
  DocumentRecord,
  Session,
  Conversation,
  Message,
  KnowledgeBase,
  KbCreateRequest,
  DocumentUploadResponse,
  RetrievalTestResponse,
  RefChunk,
  Citation,
  ChatHistoryRecord,
  OverviewStats,
  FrequentQuestionsResponse,
  UnansweredListResponse,
  SystemConfig,
  SystemConfigRequest,
  VaultImportRequest,
  VaultImportResponse,
  Insight,
  InsightListResponse,
  InsightExtractionStats,
} from "@/types/api";
import { refChunkToCitation } from "@/types/api";
import { formatDateTime, formatTime } from "@/utils/date";
import * as api from "./apiClient";

export type { OverviewStats, FrequentQuestionsResponse, UnansweredListResponse };

// ==================== 类型转换 ====================

export function kbDocumentToDocRecord(doc: KbDocument): DocumentRecord {
  let status: "uploading" | "parsing" | "success" | "failed" | "disabled" = "failed";
  if (doc.status === 0) status = "failed";
  else if (doc.status === 1) status = "parsing";
  else if (doc.status === 2) status = "success";
  else if (doc.status === 3) status = "disabled";

  return {
    id: String(doc.id),
    kbId: doc.kb_id != null ? String(doc.kb_id) : "kb-default",
    name: doc.doc_name,
    size: "—",
    source: (doc as any).source || undefined,
    chars: doc.char_count || 0,
    chunkCount: doc.chunk_count || 0,
    status,
    progress: 100,
    uploadedAt: formatDateTime(doc.created_at),
    type: doc.doc_type,
    description: doc.doc_desc || undefined,
  };
}

export function sessionToConversation(session: Session): Conversation {
  return {
    id: session.session_id,
    title: session.title,
    messages: [],
    createdAt: session.created_at,
  };
}

export function historyRecordToMessage(record: ChatHistoryRecord, index: number): {
  user: Message;
  assistant: Message;
} {
  const baseTime = formatTime(record.created_at);
  return {
    user: {
      id: `msg-user-${record.id}`,
      role: "user",
      content: record.question,
      timestamp: baseTime,
    },
    assistant: {
      id: `msg-assistant-${record.id}`,
      role: "assistant",
      content: record.answer,
      timestamp: baseTime,
      citations: record.ref_chunks?.map((c, i) => refChunkToCitation(c, i)) || [],
      roundKey: record.round_key || undefined,
    },
  };
}

// ==================== 默认知识库 ====================

const DEFAULT_KNOWLEDGE_BASE: KnowledgeBase = {
  id: 1,
  name: "默认知识库",
  description: "本地私有化 RAG 知识库，所有文档在此统一管理与检索。",
  doc_count: 0,
  char_count: 0,
  created_at: "",
  updated_at: "",
};

export function getDefaultKnowledgeBase(): KnowledgeBase {
  return { ...DEFAULT_KNOWLEDGE_BASE };
}

// ==================== 知识库 CRUD API ====================

export async function fetchKnowledgeBases(signal?: AbortSignal): Promise<KnowledgeBase[]> {
  const data = await api.get<{ items: KnowledgeBase[]; total: number }>(
    "/api/v1/kb/knowledge-bases",
    signal,
  );
  return data.items;
}

export async function createKnowledgeBase(req: KbCreateRequest, signal?: AbortSignal): Promise<KnowledgeBase> {
  return api.post<KnowledgeBase>("/api/v1/kb/knowledge-bases", req, signal);
}

export async function updateKnowledgeBase(id: number, req: KbCreateRequest, signal?: AbortSignal): Promise<KnowledgeBase> {
  return api.put<KnowledgeBase>(`/api/v1/kb/knowledge-bases/${id}`, req, signal);
}

export async function deleteKnowledgeBase(id: number, signal?: AbortSignal): Promise<void> {
  await api.del(`/api/v1/kb/knowledge-bases/${id}`, signal);
}

// ==================== 文档 API ====================

export async function fetchDocuments(
  page = 1,
  pageSize = 50,
  kbId?: number,
  signal?: AbortSignal,
): Promise<{ docs: DocumentRecord[]; total: number }> {
  let path = `/api/v1/kb/documents?page=${page}&page_size=${pageSize}`;
  if (kbId !== undefined) path += `&kb_id=${kbId}`;
  const data = await api.get<{ items: KbDocument[]; total: number }>(path, signal);
  return {
    docs: data.items.map(kbDocumentToDocRecord),
    total: data.total,
  };
}

export async function watchDocuments(
  kbId = 0,
  timeout = 60,
  signal?: AbortSignal,
): Promise<{ docs: DocumentRecord[]; total: number }> {
  const path = `/api/v1/kb/documents/watch?timeout=${timeout}&kb_id=${kbId}`;
  const data = await api.get<{ items: KbDocument[]; total: number }>(path, signal);
  return {
    docs: data.items.map(kbDocumentToDocRecord),
    total: data.total,
  };
}

export async function uploadDocuments(
  files: File[],
  kbId: number,
  signal?: AbortSignal,
): Promise<DocumentUploadResponse> {
  return api.uploadFiles<DocumentUploadResponse>(
    `/api/v1/kb/documents?kb_id=${kbId}`,
    files,
    signal,
  );
}

export async function deleteDocument(docId: number, signal?: AbortSignal): Promise<void> {
  await api.del(`/api/v1/kb/documents/${docId}`, signal);
}

export async function toggleDocumentStatus(
  docId: number,
  status: "disabled" | "enabled",
  signal?: AbortSignal,
): Promise<KbDocument> {
  return api.put<KbDocument>(`/api/v1/kb/documents/${docId}/status`, { status }, signal);
}

export async function reindexDocument(
  docId: number,
  signal?: AbortSignal,
): Promise<{ doc_id: number; doc_name: string; status: string; message: string }> {
  return api.post<{ doc_id: number; doc_name: string; status: string; message: string }>(
    `/api/v1/kb/documents/${docId}/reindex`,
    undefined,
    signal,
  );
}

export interface ChunkItem {
  id: number;
  chunk_index: number;
  content: string;
  page: number | null;
  created_at: string;
}

export async function fetchDocChunks(
  docId: number,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<{ items: ChunkItem[]; total: number }> {
  return api.get<{ items: ChunkItem[]; total: number }>(
    `/api/v1/kb/documents/${docId}/chunks?page=${page}&page_size=${pageSize}`,
    signal,
  );
}

export async function updateChunk(
  chunkId: number,
  content: string,
  signal?: AbortSignal,
): Promise<{ id: number; chunk_index: number; content: string; page: number | null; updated_at: string }> {
  return api.put<{ id: number; chunk_index: number; content: string; page: number | null; updated_at: string }>(
    `/api/v1/kb/chunks/${chunkId}`,
    { content },
    signal,
  );
}

export async function deleteChunk(chunkId: number, signal?: AbortSignal): Promise<void> {
  await api.del(`/api/v1/kb/chunks/${chunkId}`, signal);
}

export async function fetchOverviewStats(signal?: AbortSignal): Promise<OverviewStats> {
  return api.get<OverviewStats>("/api/v1/kb/stats/overview", signal);
}

export async function fetchFrequentQuestions(
  topN = 10,
  signal?: AbortSignal,
): Promise<FrequentQuestionsResponse> {
  return api.get<FrequentQuestionsResponse>(`/api/v1/kb/stats/frequent-questions?top_n=${topN}`, signal);
}

export async function fetchUnanswered(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<UnansweredListResponse> {
  return api.get<UnansweredListResponse>(`/api/v1/kb/stats/unanswered?page=${page}&page_size=${pageSize}`, signal);
}

// ==================== 会话 API ====================

export async function fetchSessions(signal?: AbortSignal): Promise<Session[]> {
  const data = await api.get<{ sessions: Session[] }>("/api/v1/kb/chat/sessions", signal);
  return data.sessions;
}

export async function fetchChatHistory(
  sessionId: string,
  page = 1,
  pageSize = 50,
  signal?: AbortSignal,
): Promise<{ items: ChatHistoryRecord[]; total: number }> {
  const params = new URLSearchParams({ session_id: sessionId, page: String(page), page_size: String(pageSize) });
  return api.get<{ items: ChatHistoryRecord[]; total: number }>(
    `/api/v1/kb/chat/history?${params}`,
    signal,
  );
}

// ==================== 检索测试 API ====================

export async function testRetrieval(
  query: string,
  topK = 5,
  threshold = 0.5,
  signal?: AbortSignal,
): Promise<RetrievalTestResponse> {
  return api.post<RetrievalTestResponse>(
    "/api/v1/kb/retrieval/test",
    { query, top_k: topK, threshold },
    signal,
  );
}

// ==================== 推理过程 ====================

export async function fetchThinkingSteps(sessionId: string, roundKey?: string): Promise<Array<{ phase: string; message: string; elapsed_ms?: number; similarity?: number }>> {
  const qs = roundKey ? `?round_key=${roundKey}` : "";
  const data = await api.get<{ session_id: string; steps: Array<{ phase: string; message: string; elapsed_ms?: number; similarity?: number }> }>(
    `/api/v1/kb/chat/thinking/${sessionId}${qs}`,
  );
  return data.steps || [];
}

// ==================== Chat SSE ====================

export { streamChat } from "./apiClient";
export type { SSEChatEvent } from "./apiClient";

// ==================== 系统配置 API ====================

export async function fetchSystemConfig(signal?: AbortSignal): Promise<SystemConfig> {
  return api.get<SystemConfig>("/api/v1/kb/config", signal);
}

export async function updateSystemConfig(
  config: SystemConfigRequest,
  signal?: AbortSignal,
): Promise<SystemConfig> {
  return api.put<SystemConfig>("/api/v1/kb/config", config, signal);
}

export async function fetchOllamaModels(signal?: AbortSignal): Promise<string[]> {
  return api.get<string[]>("/api/v1/kb/config/ollama-models", signal);
}

// ==================== 会话 API 扩展 ====================

export async function deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
  await api.del(`/api/v1/kb/chat/sessions/${sessionId}`, signal);
}

// ==================== Obsidian Vault 导入 API ====================

export async function importVault(
  req: VaultImportRequest,
  signal?: AbortSignal,
): Promise<VaultImportResponse> {
  return api.post<VaultImportResponse>("/api/v1/kb/vaults/import", req, signal);
}

export async function uploadVault(
  files: File[],
  source: string = "obsidian",
  kbId?: number,
  signal?: AbortSignal,
): Promise<VaultImportResponse> {
  return api.uploadVaultFiles<VaultImportResponse>(
    "/api/v1/kb/vaults/upload",
    files,
    source,
    kbId,
    signal,
  );
}

// ==================== 系统信息 API ====================

export interface SystemInfo {
  cpu_name: string;
  cpu_cores_logical: number;
  cpu_cores_physical: number;
  memory_total: string;
  memory_used: string;
  memory_percent: number;
}

export async function fetchSystemInfo(signal?: AbortSignal): Promise<SystemInfo> {
  return api.get<SystemInfo>("/api/v1/health/system", signal);
}

// ==================== 对话知识沉淀 API (#16) ====================

export async function fetchInsights(
  kbId?: number,
  status?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<InsightListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (kbId !== undefined) params.set("kb_id", String(kbId));
  if (status) params.set("status", status);
  return api.get<InsightListResponse>(`/api/v1/kb/insights?${params}`, signal);
}

export async function reviewInsight(
  insightId: number,
  status: "approved" | "rejected",
  targetKbId?: number,
  signal?: AbortSignal,
): Promise<Insight> {
  return api.post<Insight>(
    `/api/v1/kb/insights/${insightId}/review`,
    { status, ...(targetKbId !== undefined ? { target_kb_id: targetKbId } : {}) },
    signal,
  );
}

export async function updateInsightTargetKb(
  insightId: number,
  targetKbId: number,
  signal?: AbortSignal,
): Promise<Insight> {
  return api.put<Insight>(
    `/api/v1/kb/insights/${insightId}/target-kb`,
    { target_kb_id: targetKbId },
    signal,
  );
}

export async function deleteInsight(
  insightId: number,
  signal?: AbortSignal,
): Promise<void> {
  await api.del(`/api/v1/kb/insights/${insightId}`, signal);
}

export async function saveInsight(
  qaRecordId: number,
  kbId: number,
  signal?: AbortSignal,
): Promise<Insight> {
  const params = new URLSearchParams({ qa_record_id: String(qaRecordId), kb_id: String(kbId) });
  return api.post<Insight>(`/api/v1/kb/chat/save-insight?${params}`, undefined, signal);
}
