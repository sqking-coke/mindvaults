import type { SSEProgressEvent, SSETokenEvent, SSEDoneEvent, SSEErrorEvent } from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  code: number;
  traceId: string;
  constructor(code: number, message: string, traceId = "") {
    super(message);
    this.code = code;
    this.traceId = traceId;
    this.name = "ApiError";
  }
}

interface ApiEnvelope<T = unknown> {
  code: number;
  data: T;
  message?: string;
  trace_id?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json: ApiEnvelope<T> = await res.json();
  if (!res.ok || json.code !== 0) {
    const traceId = res.headers.get("X-Trace-Id") || json.trace_id || "";
    throw new ApiError(json.code || res.status, json.message || `HTTP ${res.status}`, traceId);
  }
  return json.data;
}

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    signal,
  });
  return handleResponse<T>(res);
}

export async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  return handleResponse<T>(res);
}

export async function put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  return handleResponse<T>(res);
}

export async function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  return handleResponse<T>(res);
}

export async function uploadFiles<T>(path: string, files: File[], signal?: AbortSignal): Promise<T> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    signal,
  });
  return handleResponse<T>(res);
}

export async function uploadVaultFiles<T>(
  path: string,
  files: File[],
  source: string = "obsidian",
  kbId?: number,
  signal?: AbortSignal,
): Promise<T> {
  const form = new FormData();
  files.forEach((f) => {
    form.append("files", f, f.webkitRelativePath || f.name);
  });
  form.append("source", source);
  if (kbId !== undefined) {
    form.append("kb_id", String(kbId));
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    signal,
  });
  return handleResponse<T>(res);
}

export type SSEChatEvent =
  | { type: "start"; data: { status: string } }
  | { type: "progress"; data: SSEProgressEvent }
  | { type: "token"; data: SSETokenEvent }
  | { type: "done"; data: SSEDoneEvent }
  | { type: "error"; data: SSEErrorEvent };

export async function* streamChat(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SSEChatEvent> {
  // 2 分钟超时保护，防止连接泄漏拖死页面
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 120_000);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: timeoutController.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(0, "No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          try {
            const parsed = JSON.parse(currentData);
            yield { type: currentEvent, data: parsed } as SSEChatEvent;
          } catch {
            // skip unparseable events
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}
