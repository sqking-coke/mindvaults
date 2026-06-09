"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type {
  Citation,
  Message,
  ThinkingStep,
  Conversation,
  KnowledgeBase,
  DocumentRecord,
  SystemConfig,
  SystemConfigRequest,
  VaultImportResponse,
} from "@/types/api";
import { refChunkToCitation } from "@/types/api";
import { formatTime, formatDateTime } from "@/utils/date";
import {
  getDefaultKnowledgeBase,
  fetchDocuments,
  watchDocuments,
  uploadDocuments as apiUploadDocuments,
  deleteDocument as apiDeleteDocument,
  toggleDocumentStatus as apiToggleDocumentStatus,
  reindexDocument as apiReindexDocument,
  fetchSessions,
  fetchChatHistory,
  historyRecordToMessage,
  kbDocumentToDocRecord,
  fetchSystemConfig,
  updateSystemConfig as apiUpdateSystemConfig,
  fetchOllamaModels,
  importVault as apiImportVault,
  uploadVault as apiUploadVault,
  deleteSession as apiDeleteSession,
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase as apiDeleteKnowledgeBase,
  fetchThinkingSteps,
} from "@/services/ragService";
import { streamChat } from "@/services/apiClient";

export type { Citation, Message, Conversation, KnowledgeBase, DocumentRecord, SystemConfig, SystemConfigRequest };

interface mindvaultsContextType {
  activeTab: "chat" | "kb";
  setActiveTab: (tab: "chat" | "kb") => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  addConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  sendMessage: (content: string) => void;
  isGenerating: boolean;
  knowledgeBases: KnowledgeBase[];
  activeKbId: string | null;
  setActiveKbId: (id: string | null) => void;
  isKbLoading: boolean;
  addKnowledgeBase: (name: string, description: string) => void;
  deleteKnowledgeBase: (id: string) => void;
  documents: DocumentRecord[];
  uploadDocuments: (kbId: string, files: File[]) => void;
  deleteDocument: (docId: string) => void;
  reparseDocument: (docId: string) => void;
  toggleDocumentStatus: (docId: string, status: "disabled" | "enabled") => Promise<void>;
  reindexDocument: (docId: string) => Promise<void>;
  selectedCitation: Citation | null;
  setSelectedCitation: (citation: Citation | null) => void;
  importVault: (path: string, source?: string) => Promise<VaultImportResponse>;
  uploadVault: (files: File[], source?: string) => Promise<VaultImportResponse>;
  
  // --- Global Dynamic System/Model configuration ---
  systemConfig: SystemConfig | null;
  ollamaModels: string[];
  loadSystemConfig: () => Promise<void>;
  updateSystemConfig: (config: SystemConfigRequest) => Promise<boolean>;
  loadOllamaModels: () => Promise<void>;
  toast: { message: string; type: "success" | "error" } | null;
  showToast: (message: string, type?: "success" | "error") => void;
  configRequiredDialog: boolean;
  configRequiredMessage: string;
  dismissConfigRequiredDialog: () => void;
}

const mindvaultsContext = createContext<mindvaultsContextType | undefined>(undefined);

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const mindvaultsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<"chat" | "kb">("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [isKbLoading, setIsKbLoading] = useState(true);
  const [activeKbId, setActiveKbId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  // --- Toast notification ---
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // --- Config required dialog ---
  const [configRequiredDialog, setConfigRequiredDialog] = useState(false);
  const [configRequiredMessage, setConfigRequiredMessage] = useState("");
  const dismissConfigRequiredDialog = useCallback(() => setConfigRequiredDialog(false), []);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Dynamic LLM and System configuration ---
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  const loadSystemConfig = useCallback(async () => {
    try {
      const cfg = await fetchSystemConfig();
      setSystemConfig(cfg);
    } catch (err) {
      console.error("Failed to load system config:", err);
    }
  }, []);

  const updateSystemConfigHandler = useCallback(async (config: SystemConfigRequest) => {
    try {
      const updated = await apiUpdateSystemConfig(config);
      setSystemConfig(updated);
      return true;
    } catch (err) {
      console.error("Failed to update system config:", err);
      return false;
    }
  }, []);

  const loadOllamaModels = useCallback(async () => {
    try {
      const models = await fetchOllamaModels();
      setOllamaModels(models);
    } catch (err) {
      console.error("Failed to load Ollama models:", err);
    }
  }, []);

  // ---- initial load from backend ----
  useEffect(() => {
    loadSystemConfig();
    loadOllamaModels();

    const savedKbId = localStorage.getItem("mv_active_kb_id");

    let cancelled = false;

    (async () => {
      try {
        // 从后端获取真实 KB 列表
        const kbs = await fetchKnowledgeBases();
        if (cancelled) return;

        if (kbs.length > 0) {
          setKnowledgeBases(kbs);
        } else {
          setKnowledgeBases([getDefaultKnowledgeBase()]);
        }

        // 恢复上次选择的 KB，或选第一个
        const restoredId = savedKbId && kbs.some(k => String(k.id) === savedKbId)
          ? savedKbId
          : kbs.length > 0 ? String(kbs[0].id) : null;
        if (restoredId) setActiveKbId(restoredId);

        // 加载文档（默认取第一个 KB，用于知识中心展示）
        const kbId = kbs.length > 0 ? kbs[0].id : 1;
        const [docResult, sessions] = await Promise.all([
          fetchDocuments(1, 50, kbId),
          fetchSessions(),
        ]);
        if (cancelled) return;

        setDocuments(docResult.docs);

        const convs: Conversation[] = sessions.map((s) => ({
          id: s.session_id,
          title: s.title,
          messages: [],
          createdAt: s.created_at,
        }));
        if (convs.length > 0) {
          setConversations(convs);
          // 不自动选中历史对话，进入 /chat 默认展示新建对话欢迎页
        }
      } catch {
        // backend unavailable — 用默认 KB 兜底，不改变 activeKbId（保持自动模式）
        setKnowledgeBases([getDefaultKnowledgeBase()]);
      } finally {
        if (!cancelled) setIsKbLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // activeKbId 持久化到 localStorage
  useEffect(() => {
    if (activeKbId) {
      localStorage.setItem("mv_active_kb_id", activeKbId);
    } else {
      localStorage.removeItem("mv_active_kb_id");
    }
  }, [activeKbId]);

  // 切换 KB / 返回列表时刷新 KB 列表和文档列表
  useEffect(() => {
    fetchKnowledgeBases().then(setKnowledgeBases).catch(() => {});
    const kbId = Number(activeKbId);
    if (!kbId || kbId <= 0) return;
    fetchDocuments(1, 50, kbId).then((r) => setDocuments(r.docs)).catch(() => {});
  }, [activeKbId]);

  // 长轮询刷新：有上传中/解析中文档时 watch 后端状态变更，无 90 秒上限
  const pollingRef = useRef(false);
  const pollingAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === "uploading" || d.status === "parsing"
    );
    if (!hasPending || pollingRef.current) return;

    pollingRef.current = true;
    const kbId = Number(activeKbId || 1);
    let cancelled = false;

    const watch = async () => {
      while (!cancelled) {
        try {
          pollingAbortRef.current = new AbortController();
          const refreshed = await watchDocuments(kbId, 60, pollingAbortRef.current.signal);
          if (cancelled) return;
          setDocuments(refreshed.docs);
          const stillPending = refreshed.docs.some(
            (d) => d.status === "uploading" || d.status === "parsing"
          );
          if (!stillPending) break;
        } catch {
          break;
        }
      }
      pollingRef.current = false;
      pollingAbortRef.current = null;
    };

    watch();

    return () => {
      cancelled = true;
      pollingAbortRef.current?.abort();
      pollingRef.current = false;
      pollingAbortRef.current = null;
    };
  }, [documents]);

  // load chat history when switching conversations
  useEffect(() => {
    if (!activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv || conv.messages.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const hist = await fetchChatHistory(activeConversationId);
        if (cancelled) return;
        const msgs: Message[] = [];
        for (const r of hist.items) {
          const { user, assistant } = historyRecordToMessage(r, hist.items.indexOf(r));
          // 按轮次从 Redis 加载推理步骤
          if (assistant.roundKey) {
            try {
              const steps = await fetchThinkingSteps(activeConversationId, assistant.roundKey);
              assistant.thinkingSteps = steps.map((s) => ({
                text: s.message,
                phase: s.phase,
                elapsed_ms: s.elapsed_ms,
                similarity: s.similarity,
              }));
            } catch {}
          }
          msgs.push(user, assistant);
        }
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, messages: msgs } : c)),
        );
      } catch {
        // empty history is ok
      }
    })();
    return () => { cancelled = true; };
  }, [activeConversationId]);

  const addConversation = useCallback(() => {
    const id = generateUUID();
    const newConv: Conversation = {
      id,
      title: "新建对话",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(id);
    setActiveKbId(null);  // 新对话默认「自动」模式
    return id;
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });

      // 同步删除后端数据；空对话后端无记录（404），视为删除成功
      apiDeleteSession(id)
        .then(() => showToast("对话已删除"))
        .catch((err) => {
          if (err?.code === 3001) {
            // 会话不存在于后端（空对话），本地已删除即可
            return;
          }
          console.error("Failed to delete session on server:", err);
          showToast("删除失败，请重试", "error");
        });
    },
    [activeConversationId],
  );

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: title.trim() || "未命名对话" } : c)),
    );
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isGenerating) return;

      // Auto-create conversation if none is active (first-time user)
      let sessionId = activeConversationId;
      if (!sessionId) {
        sessionId = generateUUID();
        const newConv: Conversation = {
          id: sessionId,
          title: content.substring(0, 15) + (content.length > 15 ? "..." : ""),
          createdAt: new Date().toISOString(),
          messages: [],
        };
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(sessionId);
        setActiveKbId(null);  // 新对话默认「自动」模式
      }

      const timestamp = formatTime();
      const userMsg: Message = {
        id: `msg-user-${Date.now()}`,
        role: "user",
        content,
        timestamp,
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === sessionId) {
            const title =
              c.title === "新建对话"
                ? content.substring(0, 15) + (content.length > 15 ? "..." : "")
                : c.title;
            return { ...c, title, messages: [...c.messages, userMsg] };
          }
          return c;
        }),
      );
      setIsGenerating(true);

      const assistantId = `msg-assistant-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp,
        citations: [],
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === sessionId ? { ...c, messages: [...c.messages, assistantMsg] } : c,
        ),
      );

      const abortController = new AbortController();

      (async () => {
        try {
          for await (const event of streamChat(
            "/api/v1/kb/chat",
            { question: content, session_id: sessionId, kb_id: activeKbId === "0" ? 0 : (activeKbId ? Number(activeKbId) : undefined) },
            abortController.signal,
          )) {
            if (event.type === "progress") {
              const step: ThinkingStep = {
                text: event.data.message,
                phase: event.data.phase,
                elapsed_ms: event.data.elapsed_ms,
                similarity: event.data.similarity,
              };
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === sessionId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? { ...m, thinkingSteps: [...(m.thinkingSteps || []), step] }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            } else if (event.type === "token") {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === sessionId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? { ...m, content: m.content + event.data.content }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            } else if (event.type === "done") {
              const citations: Citation[] = (event.data.ref_chunks || []).map((rc, i) =>
                refChunkToCitation(rc, i),
              );
              const concepts = (event.data.concepts || []) as { name: string; summary: string; aliases?: string[] }[];
              const roundKey = (event.data as any).round_key as string | undefined;
              const qaRecordId = event.data.qa_record_id;
              // 替换临时 ID（Date.now() 时间戳）为真实 DB ID，后续「保存到知识库」依赖此 ID
              const realAssistantId = `msg-assistant-${qaRecordId}`;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === sessionId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? { ...m, id: realAssistantId, citations, roundKey, concepts }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            } else if (event.type === "error") {
              const errorCode = (event.data as { code?: number }).code;
              const errorMessage = (event.data as { message?: string }).message || "未知错误";
              const isRouteFallback = (event.data as { route_fallback?: boolean }).route_fallback;

              // 友好提示：根据错误码显示引导文案而非冷冰冰的错误
              let displayContent: string;
              if (isRouteFallback) {
                // Layer 3 路由未命中 → 显示引导消息（含候选 KB）
                displayContent = errorMessage;
              } else if (errorCode === 4001) {
                displayContent =
                  "📄 知识库中还没有文档，我暂时无法回答你的问题。\n\n请先在左侧 知识中心 中上传文档（支持 PDF / Word / Markdown / TXT），上传完成后即可开始智能问答。";
              } else if (errorCode === 5003) {
                displayContent = `⚠️ ${errorMessage}\n\n请点击页面弹出的提示框前往系统设置页面检查 API Key 配置。`;
                setConfigRequiredMessage(errorMessage);
                setConfigRequiredDialog(true);
              } else if (
                (errorCode === 5001 || errorCode === 5002) &&
                /401|403|unauthorized|api.?key|认证|未配置|无效/.test(errorMessage.toLowerCase())
              ) {
                displayContent = `⚠️ ${errorMessage}\n\n请点击页面弹出的提示框前往系统设置页面检查 API Key 配置。`;
                setConfigRequiredMessage(errorMessage);
                setConfigRequiredDialog(true);
              } else {
                displayContent = `⚠️ ${errorMessage}`;
              }

              setConversations((prev) =>
                prev.map((c) =>
                  c.id === sessionId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? { ...m, content: displayContent }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "未知错误";
          setConversations((prev) =>
            prev.map((c) =>
              c.id === sessionId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: `⚠️ 请求发送失败，请检查后端服务是否正常运行。\n\n> ${msg}` }
                        : m,
                    ),
                  }
                : c,
            ),
          );
        } finally {
          setIsGenerating(false);
        }
      })();
    },
    [activeConversationId, activeKbId, isGenerating],
  );

  const addKnowledgeBase = useCallback(async (name: string, description: string) => {
    const kb = await createKnowledgeBase({ name, description });
    setKnowledgeBases((prev) => [...prev, kb]);
    setActiveKbId(String(kb.id));
    // 切换到新 KB 时清空文档列表
    setDocuments([]);
  }, []);

  const deleteKnowledgeBase = useCallback(
    async (id: string) => {
      // 系统保护：默认系统库不可删除
      if (id === "1") return;
      try {
        await apiDeleteKnowledgeBase(Number(id));
        showToast("知识库已删除");
      } catch (err) {
        console.error("Failed to delete KB on server:", err);
        showToast("删除失败，请重试", "error");
      }
      setKnowledgeBases((prev) => prev.filter((kb) => String(kb.id) !== id));
      setDocuments((prev) => prev.filter((doc) => doc.kbId !== id));
      if (activeKbId === id) {
        const remaining = knowledgeBases.filter((kb) => String(kb.id) !== id);
        setActiveKbId(remaining.length > 0 ? String(remaining[0].id) : null);
        // 切换 KB 时重新加载文档
        if (remaining.length > 0) {
          fetchDocuments(1, 50, remaining[0].id).then((r) => setDocuments(r.docs)).catch(() => {});
        }
      }
    },
    [activeKbId, knowledgeBases],
  );

  const uploadDocumentsHandler = useCallback(
    (kbId: string, files: File[]) => {
      if (files.length === 0) return;

      // add optimistic entries
      const now = formatDateTime(new Date().toISOString());
      const tempDocs: DocumentRecord[] = files.map((f, i) => ({
        id: `doc-temp-${Date.now()}-${i}`,
        kbId,
        name: f.name,
        size: f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
        chars: 0,
        chunkCount: 0,
        status: "uploading" as const,
        progress: 10,
        uploadedAt: now,
        type: f.type,
      }));
      setDocuments((prev) => [...tempDocs, ...prev]);

      apiUploadDocuments(files, Number(kbId))
        .then((result) => {
          // replace temp docs with real ones from the response
          const uploaded = result.documents.map((d) => kbDocumentToDocRecord({
            id: d.id,
            doc_name: d.doc_name,
            doc_type: "txt" as const,
            doc_desc: null,
            file_path: "",
            status: d.status,
            chunk_count: d.chunk_count,
            kb_id: d.kb_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          setDocuments((prev) => {
            const withoutTemp = prev.filter((d) => !d.id.startsWith("doc-temp-"));
            return [...uploaded, ...withoutTemp];
          });
          // 刷新 KB 列表，同步 doc_count
          fetchKnowledgeBases().then(setKnowledgeBases).catch(() => {});
        })
        .catch(() => {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id.startsWith("doc-temp-") ? { ...d, status: "failed" as const } : d,
            ),
          );
        });

      try {
        // refresh the full document list
        const kbId = Number(activeKbId || 1);
        fetchDocuments(1, 50, kbId).then((result) => {
          setDocuments(result.docs);
        });
      } catch {
        // refresh failed, keep optimistic state
      }
    },
    [activeKbId],
  );

  const importVaultHandler = useCallback(
    async (path: string, source: string = "obsidian") => {
      try {
        const kbId = Number(activeKbId || 1);
        const response = await apiImportVault({ path, source, kb_id: kbId });
        try {
          const kbId = Number(activeKbId || 1);
          const result = await fetchDocuments(1, 50, kbId);
          setDocuments(result.docs);
        } catch (fetchErr) {
          console.error("Failed to refresh documents list after vault import:", fetchErr);
        }
        return response;
      } catch (err) {
        console.error("Failed inside importVaultHandler:", err);
        throw err;
      }
    },
    [activeKbId],
  );

  const uploadVaultHandler = useCallback(
    async (files: File[], source: string = "obsidian") => {
      try {
        const kbId = Number(activeKbId || 1);
        const response = await apiUploadVault(files, source, kbId);
        try {
          const kbId = Number(activeKbId || 1);
          const result = await fetchDocuments(1, 50, kbId);
          setDocuments(result.docs);
        } catch (fetchErr) {
          console.error("Failed to refresh documents list after vault upload:", fetchErr);
        }
        return response;
      } catch (err) {
        console.error("Failed inside uploadVaultHandler:", err);
        throw err;
      }
    },
    [activeKbId],
  );

  const deleteDocumentHandler = useCallback(
    (docId: string) => {
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;

      setDocuments((prev) => prev.filter((d) => d.id !== docId));

      const numericId = Number(docId);
      if (!isNaN(numericId)) {
        apiDeleteDocument(numericId)
          .then(() => {
            showToast("文档已删除");
            fetchKnowledgeBases().then(setKnowledgeBases).catch(() => {});
          })
          .catch(() => {
            showToast("删除失败，已恢复", "error");
            fetchDocuments(1, 50)
              .then((result) => setDocuments(result.docs))
              .catch(() => {});
          });
      }
    },
    [documents],
  );

  const reparseDocument = useCallback(
    (docId: string) => {
      // reparse not directly supported by backend; refresh document list instead
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, status: "parsing" as const, progress: 0 } : d,
        ),
      );
      fetchDocuments(1, 50)
        .then((result) => setDocuments(result.docs))
        .catch(() => {});
    },
    [],
  );

  const toggleDocumentStatus = useCallback(
    async (docId: string, status: "disabled" | "enabled") => {
      const numericId = Number(docId);
      if (isNaN(numericId)) return;

      // Optimistic update
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, status: status === "disabled" ? "disabled" as const : "parsing" as const }
            : d,
        ),
      );

      try {
        const updated = await apiToggleDocumentStatus(numericId, status);
        // Map the response status back
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId ? kbDocumentToDocRecord(updated) : d,
          ),
        );
      } catch (err) {
        // Revert on error
        const result = await fetchDocuments(1, 50);
        setDocuments(result.docs);
        throw err;
      }
    },
    [],
  );

  const reindexDocumentHandler = useCallback(
    async (docId: string) => {
      const numericId = Number(docId);
      if (isNaN(numericId)) return;

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, status: "parsing" as const, progress: 0 } : d,
        ),
      );

      try {
        await apiReindexDocument(numericId);
        
        // Polling status or simply load again after delay
        const checkStatus = async () => {
          try {
            const result = await fetchDocuments(1, 50);
            const currentDoc = result.docs.find(d => d.id === docId);
            if (currentDoc) {
              setDocuments(result.docs);
              if (currentDoc.status === "parsing") {
                setTimeout(checkStatus, 3000); // Poll every 3 seconds if still parsing
              }
            }
          } catch {
            // Keep trying or stop on error
          }
        };
        setTimeout(checkStatus, 2000);
      } catch (err) {
        const result = await fetchDocuments(1, 50);
        setDocuments(result.docs);
        throw err;
      }
    },
    [],
  );

  return (
    <mindvaultsContext.Provider
      value={{
        activeTab,
        setActiveTab,
        conversations,
        activeConversationId,
        setActiveConversationId,
        addConversation,
        deleteConversation,
        renameConversation,
        sendMessage,
        isGenerating,
        knowledgeBases,
        activeKbId,
        setActiveKbId,
        isKbLoading,
        addKnowledgeBase,
        deleteKnowledgeBase,
        documents,
        uploadDocuments: uploadDocumentsHandler,
        deleteDocument: deleteDocumentHandler,
        reparseDocument,
        toggleDocumentStatus,
        reindexDocument: reindexDocumentHandler,
        selectedCitation,
        setSelectedCitation,
        importVault: importVaultHandler,
        uploadVault: uploadVaultHandler,
        
        // --- Dynamic System/Model configuration ---
        systemConfig,
        ollamaModels,
        loadSystemConfig,
        updateSystemConfig: updateSystemConfigHandler,
        loadOllamaModels,
        toast,
        showToast,
        configRequiredDialog,
        configRequiredMessage,
        dismissConfigRequiredDialog,
      }}
    >
      {children}
    </mindvaultsContext.Provider>
  );
};

export const usemindvaults = () => {
  const context = useContext(mindvaultsContext);
  if (!context) throw new Error("usemindvaults must be used within a mindvaultsProvider");
  return context;
};
