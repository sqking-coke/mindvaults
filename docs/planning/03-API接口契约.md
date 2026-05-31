# 03 - API 接口契约

> 来源：02-接口契约文档.md + 当前实际后端代码 | 状态：⚠️ 多 KB 接口待更新

## 基础约定

| 项目 | 约定 |
|------|------|
| Base URL | `/api/v1` |
| 请求格式 | JSON (`Content-Type: application/json`) |
| 响应格式 | `{ "code": 0, "data": {...} }` (成功) / `{ "code": <n>, "message": "..." }` (失败) |
| 认证 | `Authorization: Bearer <API_KEY>` |
| 流式 | SSE (`text/event-stream`)，事件: `progress` / `token` / `done` / `error` |

---

## 1. 知识库管理（NEW ★）

### `POST /api/v1/kb/knowledge-bases` — 创建知识库
```json
// Request
{ "name": "技术文档库", "description": "存放 API 规范和架构设计" }
// Response
{ "code": 0, "data": { "id": 1, "name": "技术文档库", "description": "...", "doc_count": 0, "created_at": "..." } }
```

### `GET /api/v1/kb/knowledge-bases` — 列出所有知识库
```json
// Response
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "默认知识库",
        "description": "...",
        "doc_count": 5,
        "created_at": "2026-05-30T...",
        "updated_at": "2026-05-30T..."
      }
    ],
    "total": 1
  }
}
```

### `PUT /api/v1/kb/knowledge-bases/{kb_id}` — 更新知识库
### `DELETE /api/v1/kb/knowledge-bases/{kb_id}` — 删除知识库（级联文档+切片）
### `GET /api/v1/kb/knowledge-bases/{kb_id}/config` — 获取 KB 级配置
### `PUT /api/v1/kb/knowledge-bases/{kb_id}/config` — 更新 KB 级配置

---

## 2. 文档管理（更新 ★）

### `POST /api/v1/kb/documents?kb_id=X` — 上传文档 ★
```
Content-Type: multipart/form-data
Body: files[] (File array)
Query: kb_id (必填) ← NEW
约束: 最大 50MB, 允许 txt/md/pdf/docx/doc
```

### `GET /api/v1/kb/documents?kb_id=X&page=1&page_size=20` — 文档列表 ★
新增 `kb_id` 查询参数过滤。

### `GET /api/v1/kb/documents/{id}` — 文档详情
### `DELETE /api/v1/kb/documents/{id}` — 删除文档（软删除）
### `PUT /api/v1/kb/documents/{id}` — 更新文档
### `PUT /api/v1/kb/documents/{id}/status` — 切换文档启用/禁用
### `POST /api/v1/kb/documents/{id}/reindex` — 重索引

### `GET /api/v1/kb/documents/watch?kb_id=X&timeout=60` — 长轮询文档状态
有未完成文档时每 2s 检查状态变更，变化或超时返回。用于前端实时更新摄入进度。

### `GET /api/v1/kb/documents/{id}/content` — 原文预览
返回文档原始文本内容，按需读取文件不落库。

```json
// Response
{"code":0,"data":{"doc_name":"...","doc_type":"md","content":"...","chars":1234}}
```

---

## 3. 智能问答

### `POST /api/v1/kb/chat` — 发起问答（SSE 流式）
```json
// Request
{ "question": "微服务之间如何通信？", "session_id": "<uuid>", "kb_id": 1 }
```
> `kb_id` 可选，不传则使用会话绑定的 KB。

**SSE 事件流**：
```
event: progress
data: {"phase":"intent","message":"正在分析问题意图 (识别为: knowledge_qa)...","elapsed_ms":0}

event: progress
data: {"phase":"retrieval","message":"正在将问题转换为向量表示...","elapsed_ms":5}

event: progress
data: {"phase":"retrieval","message":"正在检索本地向量数据库 (阈值 > 50%)...","elapsed_ms":149}

event: progress
data: {"phase":"matching","message":"查找到 5 个相关文档分块，来自 1 份文档：","elapsed_ms":153}

event: progress
data: {"phase":"matching","message":" -> [1] arch.md (页码: 14)，匹配度: 94.6%","elapsed_ms":153}

event: progress
data: {"phase":"generating","message":"正在调用大模型 Ollama (本地): deepseek-r1:8b 进行推理生成...","elapsed_ms":155}

event: token
data: {"content":"微服务"}

... (streaming tokens)

event: done
data: {"ref_chunks":[...],"round_key":"a1b2c3d4"}
```

> `round_key`: 本轮唯一标识，对应 Redis `mv:thinking:{session_id}:{round_key}` 推理步骤 key。

### `GET /api/v1/kb/chat/thinking/{session_id}?round_key=X` — 推理步骤
按轮次查询推理过程。`round_key` 为空时返回整个会话的所有步骤（不推荐）。

### `GET /api/v1/kb/chat/history?session_id=<uuid>` — 问答历史
> Response 每条记录含 `round_key` 字段。

### `GET /api/v1/kb/chat/sessions` — 会话列表
### `DELETE /api/v1/kb/chat/sessions/{session_id}` — 删除会话

---

## 4. 检索测试

### `POST /api/v1/kb/retrieval/test` — 检索沙盒
```json
{ "query": "微服务架构", "top_k": 5, "threshold": 0.7, "kb_id": 1 }
```

### `GET /api/v1/kb/chunks/{id}/preview` — 切片预览

---

## 5. 统计与健康

### `GET /api/v1/kb/stats/overview` — 全局统计概览
### `GET /api/v1/kb/stats/frequent-questions?top_n=10` — 高频问题
### `GET /api/v1/kb/stats/unanswered` — 待补充问题
### `GET /api/v1/health` — 服务健康检查
### `GET /api/v1/health/system` — 系统信息（CPU/内存）

---

## 6. Vault 导入

### `POST /api/v1/kb/vaults/import` — 路径扫描导入
```json
{ "path": "/Users/xxx/ObsidianVault", "source": "obsidian", "kb_id": 1 }
```

### `POST /api/v1/kb/vaults/upload` — 文件夹拖拽上传
```
multipart/form-data: files[] + kb_id
```

---

## 7. 错误码约定

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 参数校验失败 |
| 2001 | 文档不存在 |
| 2002 | 文档格式不支持 |
| 2003 | 文档大小超出限制 |
| 3001 | 会话不存在 |
| 4001 | 未找到相关知识（检索无结果） |
| 5001 | 大模型调用失败 |
| 5002 | Embedding 模型不可用 |
| 6001 | 知识库不存在 ← NEW |
| 9001 | 服务内部错误 |

---

## 8. 前端 ↔ 后端类型映射

| 前端 TypeScript | 后端 Pydantic | 说明 |
|-----------------|--------------|------|
| `KnowledgeBase` | `KbInfo` | 对齐，新增后端接口 |
| `DocumentRecord` | `DocumentResponse` | kbId 现在来自后端 |
| `Message` | `ChatMessage` | 新增 thinkingSteps / roundKey |
| `Citation` | `RefChunk` | 前端计算 index |
| `DocumentRecord` | `DocumentResponse` | 新增 file_size / status_detail |
| `Conversation` | `Session` | id → session_id |
| `SystemConfig` | `ConfigResponse` | llm_model 等动态字段 |
