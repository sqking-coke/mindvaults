// ============================================================
// mindvaults API 契约 — 前后端共同基准
// 基于设计文档 v1.1 第 8 章 + 前端 Mock 原型数据模型
// ============================================================

// ==================== 共享领域类型 ====================

/** 文档切片引用（对齐后端 RefChunk，前端渲染为 Citation） */
export interface RefChunk {
  chunk_id: number;
  doc_name: string;
  content: string;
  similarity: number; // 0~1
  page?: number;
}

/** 前端引用溯源（渲染用，index 为前端计算） */
export interface Citation {
  id: string;
  index: number;
  docName: string;
  snippet: string;
  score: number;
  page?: number;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: RefChunk[];
}

/** 会话 */
export interface Session {
  id: number;
  session_id: string; // UUID
  title: string;
  created_at: string; // ISO 8601
  updated_at: string;
}

/** 知识库文档（对应后端 KbDocument） */
export interface KbDocument {
  id: number;
  kb_id: number;
  doc_name: string;
  doc_type: "txt" | "md" | "pdf" | "docx" | "doc";
  doc_desc: string | null;
  file_path: string;
  status: 0 | 1 | 2 | 3; // 0=失败, 1=解析中, 2=成功, 3=禁用
  chunk_count: number;
  char_count?: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

/** 知识库配置 */
export interface KbConfig {
  embedding_dim: number;
  chunk_size: number;
  chunk_overlap: number;
  top_k: number;
  similarity_threshold: number;
}

/** PUT /api/v1/kb/config — UpdateRequest */
export type KbConfigUpdateRequest = Partial<KbConfig>;

// ==================== 前端领域类型（保留现有命名，对齐后端字段） ====================

/** 推理步骤（来自 SSE progress 事件） */
export interface ThinkingStep {
  text: string;
  phase: string;
  elapsed_ms?: number;
  similarity?: number;
}

/** 前端 Message（与 ChatMessage 对齐，citations 用前端 Citation 类型） */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: Citation[];
  thinkingSteps?: ThinkingStep[];
  roundKey?: string;
}

/** 前端 Conversation（与 Session 对齐） */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

/** 前端知识库（对齐后端 API 返回的 snake_case 字段） */
export interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  doc_count: number;
  char_count: number;
  created_at: string;
  updated_at: string;
}

export interface KbCreateRequest {
  name: string;
  description?: string;
}

/** 前端文档记录（与 KbDocument 对齐） */
export interface DocumentRecord {
  id: string;
  kbId: string;
  name: string;
  size: string;
  chars: number;
  chunkCount: number;
  status: "uploading" | "parsing" | "success" | "failed" | "disabled";
  progress: number; // 0~100
  uploadedAt: string;
  type?: string;
  description?: string;
}

// ==================== API 统一响应格式 ====================

export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
}

export interface ApiError {
  code: number;
  message: string;
}

// ==================== 分页 ====================

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ==================== 文档管理 API ====================

/** POST /api/v1/kb/documents — UploadResponse */
export interface DocumentUploadResponse {
  documents: Pick<KbDocument, "id" | "kb_id" | "doc_name" | "status" | "chunk_count">[];
  total: number;
}

/** GET /api/v1/kb/documents — ListResponse */
export interface DocumentListResponse extends PaginatedData<KbDocument> {}

/** PUT /api/v1/kb/documents/{id} — UpdateRequest */
export interface DocumentUpdateRequest {
  doc_name?: string;
  doc_desc?: string;
}

// ==================== 智能问答 API（SSE 流式） ====================

/** POST /api/v1/kb/chat — Request */
export interface ChatRequest {
  question: string;
  session_id: string;
}

/** SSE event: progress */
export interface SSEProgressEvent {
  phase: "intent" | "retrieval" | "matching" | "generating";
  message: string;
  intent?: string;
  elapsed_ms?: number;
  similarity?: number;
}

/** SSE event: token */
export interface SSETokenEvent {
  content: string;
}

/** SSE event: done */
export interface SSEDoneEvent {
  ref_chunks: RefChunk[];
  round_key: string;
}

/** SSE event: error */
export interface SSEErrorEvent {
  code: number;
  message: string;
}

/** GET /api/v1/kb/chat/history — HistoryResponse */
export interface ChatHistoryRecord {
  id: number;
  question: string;
  answer: string;
  ref_chunks: RefChunk[];
  model_name: string;
  round_key?: string | null;
  created_at: string;
}

export interface ChatHistoryResponse extends PaginatedData<ChatHistoryRecord> {}

/** GET /api/v1/kb/chat/sessions — SessionsResponse */
export interface SessionsListResponse {
  sessions: Session[];
}

// ==================== 检索测试 API ====================

/** POST /api/v1/kb/retrieval/test — Request */
export interface RetrievalTestRequest {
  query: string;
  top_k?: number;
  threshold?: number;
}

/** Response */
export interface RetrievalTestResponse {
  results: RefChunk[];
  elapsed_ms: number;
}

/** GET /api/v1/kb/chunks/{id}/preview — Response */
export interface ChunkPreviewResponse {
  chunk_id: number;
  doc_name: string;
  preview: string;
  similarity: number;
}

/** POST /api/v1/kb/chunks/{id}/locate — Response (P2) */
export interface ChunkLocateResponse {
  chunk_id: number;
  page: number;
  offset: number;
  highlight_anchor: string;
}

// ==================== 问答统计 API (P2) ====================

export interface OverviewStats {
  total_documents: number;
  active_documents: number;
  disabled_documents: number;
  processing_documents: number;
  total_chunks: number;
  total_qa_records: number;
  avg_similarity: number;
  total_storage_bytes: number;
  last_ingestion_at: string | null;
  last_qa_at: string | null;
}

export interface FrequentQuestionItem {
  rank: number;
  question: string;
  count: number;
  last_asked_at: string;
}

export interface FrequentQuestionsResponse {
  items: FrequentQuestionItem[];
  total_unique_questions: number;
}

export interface UnansweredItem {
  id: number;
  question: string;
  created_at: string;
  session_id: number;
}

export interface UnansweredListResponse extends PaginatedData<UnansweredItem> {}

// ==================== 健康检查 API ====================

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  database: "connected" | "disconnected";
  redis: "connected" | "disconnected";
  embedding_model: string;
  llm_model: string;
}

// ==================== 错误码 ====================

export const ErrorCode = {
  SUCCESS: 0,
  BAD_REQUEST: 1001,
  DOC_NOT_FOUND: 2001,
  DOC_FORMAT_UNSUPPORTED: 2002,
  DOC_SIZE_EXCEEDED: 2003,
  SESSION_NOT_FOUND: 3001,
  RETRIEVAL_TIMEOUT: 4001,
  LLM_CALL_FAILED: 5001,
  EMBEDDING_UNAVAILABLE: 5002,
  INTERNAL_ERROR: 9001,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ==================== 类型转换辅助 ====================

/** RefChunk → 前端 Citation */
export function refChunkToCitation(chunk: RefChunk, index: number): Citation {
  return {
    id: `cit-${chunk.chunk_id}`,
    index,
    docName: chunk.doc_name,
    snippet: chunk.content,
    score: chunk.similarity,
    page: chunk.page,
  };
}

// ==================== 系统配置 API 契约 ====================

export interface SystemConfig {
  chunk_size: number;
  chunk_overlap: number;
  top_k: number;
  similarity_threshold: number;
  embedding_dim: number;
  llm_provider: string;
  llm_base_url: string;
  llm_model: string;
  llm_api_key: string;
  llm_temperature: number;
  system_prompt: string;
}

export interface SystemConfigRequest {
  chunk_size?: number;
  chunk_overlap?: number;
  top_k?: number;
  similarity_threshold?: number;
  llm_provider?: string;
  llm_base_url?: string;
  llm_model?: string;
  llm_api_key?: string;
  llm_temperature?: number;
  system_prompt?: string;
}

// ==================== Obsidian Vault 导入 API 契约 ====================

export interface VaultImportRequest {
  path: string;
  source?: string;
  kb_id: number;
}

export interface VaultImportError {
  file: string;
  reason: string;
}

export interface VaultImportDocument {
  id: number;
  doc_name: string;
  status: number;
}

export interface VaultImportResponse {
  total_found: number;
  imported: number;
  failed: number;
  errors: VaultImportError[];
  documents: VaultImportDocument[];
}
