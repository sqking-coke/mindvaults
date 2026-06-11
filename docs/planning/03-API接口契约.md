# 03 - API 接口契约

> 来源：02-接口契约文档.md + 当前实际后端代码 | 状态：✅ 已实现 | 更新：2026-06-11 | 版本：v0.9.0

## 基础约定

| 项目 | 约定 |
|------|------|
| Base URL | `/api/v1` |
| 请求格式 | JSON (`Content-Type: application/json`) |
| 响应格式 | `{ "code": 0, "data": {...} }` (成功) / `{ "code": <n>, "message": "..." }` (失败) |
| 认证 | `Authorization: Bearer <API_KEY>` |
| 流式 | SSE (`text/event-stream`)，事件: `progress` / `token` / `done` / `error` |

---

## 1. 知识库管理

### `POST /api/v1/kb/knowledge-bases` — 创建知识库
```json
// Request
{ "name": "技术文档库", "description": "存放 API 规范和架构设计" }
// Response
{ "code": 0, "data": { "id": 1, "name": "技术文档库", "description": "...", "doc_count": 0, "created_at": "..." } }
```

### `GET /api/v1/kb/knowledge-bases` — 列出所有知识库
### `PUT /api/v1/kb/knowledge-bases/{kb_id}` — 更新知识库
### `DELETE /api/v1/kb/knowledge-bases/{kb_id}` — 删除知识库（级联文档+切片）
### `GET /api/v1/kb/knowledge-bases/{kb_id}/config` — 获取 KB 级配置
### `PUT /api/v1/kb/knowledge-bases/{kb_id}/config` — 更新 KB 级配置

---

## 2. 文档管理

### `POST /api/v1/kb/documents?kb_id=X` — 上传文档
```
Content-Type: multipart/form-data
Body: files[] (File array)
Query: kb_id (必填)
约束: 最大 50MB, 允许 txt/md/pdf/docx/doc
```

### `GET /api/v1/kb/documents?kb_id=X&page=1&page_size=20` — 文档列表
### `GET /api/v1/kb/documents/{id}` — 文档详情
### `DELETE /api/v1/kb/documents/{id}` — 删除文档（软删除）
### `PUT /api/v1/kb/documents/{id}` — 更新文档
### `PUT /api/v1/kb/documents/{id}/status` — 切换文档启用/禁用
### `POST /api/v1/kb/documents/{id}/reindex` — 重索引（重新走预处理+切片+embed）
### `GET /api/v1/kb/documents/watch?kb_id=X&timeout=60` — 长轮询文档状态
### `GET /api/v1/kb/documents/{id}/content` — 原文预览
### `GET /api/v1/kb/documents/{id}/chunks` — 文档切片列表
### `GET /api/v1/kb/documents/{id}/file` — 下载原始文件

---

## 3. 智能问答

### `POST /api/v1/kb/chat` — 发起问答（SSE 流式）
```json
// Request
{ "question": "微服务之间如何通信？", "session_id": "<uuid>", "kb_id": 1 }
```
> `kb_id` 可选，不传则使用会话绑定的 KB 或触发智能路由。

**SSE 事件流**：
```
event: progress
data: {"phase":"intent","message":"正在分析问题意图 (识别为: knowledge_qa)...","elapsed_ms":0}

event: progress
data: {"phase":"routing","kb_name":"Python 技术文档","method":"centroid","elapsed_ms":1}

event: progress
data: {"phase":"retrieval","message":"正在将问题转换为向量表示...","elapsed_ms":5}

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
### `GET /api/v1/kb/chat/sessions` — 会话列表
### `DELETE /api/v1/kb/chat/sessions/{session_id}` — 删除会话
### `POST /api/v1/kb/chat/save-insight` — 从回答中手动提炼知识点

---

## 4. 检索测试

### `POST /api/v1/kb/retrieval/test` — 检索沙盒
```json
{ "query": "微服务架构", "top_k": 5, "threshold": 0.7, "kb_id": 1 }
```

### `GET /api/v1/kb/chunks/{id}/preview` — 切片预览
### `PUT /api/v1/kb/chunks/{id}` — 更新切片
### `DELETE /api/v1/kb/chunks/{id}` — 删除切片
### `POST /api/v1/kb/chunks/{id}/locate` — 定位切片所在文档

---

## 5. 知识沉淀（v0.5.0）🆕

### `GET /api/v1/kb/insights?kb_id=X&status=pending&page=1&page_size=20` — 知识点列表
### `GET /api/v1/kb/insights/{id}` — 知识点详情
### `DELETE /api/v1/kb/insights/{id}` — 删除知识点
### `POST /api/v1/kb/insights/extract` — 手动触发提炼批处理
### `POST /api/v1/kb/insights/{id}/review` — 审核知识点（通过/拒绝）
```json
// Request
{ "action": "approve", "target_kb_id": 1 }
```
### `PUT /api/v1/kb/insights/{id}/target-kb` — 修改知识点归属 KB
### `GET /api/v1/kb/insights/schedule-status` — 查询定时提炼状态

---

## 6. 外部推送 — Skill 插件（v0.5.0）🆕

### `POST /api/v1/kb/external/push` — 外部平台推送对话
```
Headers: Authorization: Bearer <external_api_key>
Body:
{
  "entries": [
    {
      "question": "...",
      "answer": "...",
      "session_title": "...",
      "platform": "claude_code"
    }
  ]
}
// Response
{ "code": 0, "data": { "entry_ids": [1, 2], "skipped": 0 } }
```

---

## 7. 概念术语关联（v0.7.0）🆕

### `GET /api/v1/kb/concepts?kb_id=X&page=1&page_size=20&search=` — 概念列表
### `GET /api/v1/kb/concepts/{id}` — 概念详情（含关联 chunk）
### `POST /api/v1/kb/concepts` — 手动创建概念
### `PUT /api/v1/kb/concepts/{id}` — 更新概念
### `DELETE /api/v1/kb/concepts/{id}` — 删除概念
### `POST /api/v1/kb/concepts/{id}/link` — 手动关联概念到 chunk
### `POST /api/v1/kb/concepts/suggest-chunks` — 为概念推荐关联 chunk
### `POST /api/v1/kb/concepts/cleanup-orphans` — 清理孤立概念

---

## 8. 知识库健康治理（v0.6.0）🆕

### `POST /api/v1/kb/health/scan` — 触发健康扫描
```json
// Request
{ "kb_id": 1, "scan_type": "manual" }
```

### `GET /api/v1/kb/health/reports?kb_id=X` — 健康报告列表
### `GET /api/v1/kb/health/reports/latest?kb_id=X` — 最新健康报告
### `GET /api/v1/kb/health/reports/{id}` — 健康报告详情
### `POST /api/v1/kb/health/reports/{id}/resolve` — 执行推荐修复方案
### `DELETE /api/v1/kb/health/reports/{id}` — 删除报告
### `POST /api/v1/kb/health/merge` — 合并相似 chunk
### `POST /api/v1/kb/health/link` — 链接相似 chunk
### `DELETE /api/v1/kb/health/link/{id}` — 取消链接
### `POST /api/v1/kb/health/archive` — 归档过期 chunk
### `POST /api/v1/kb/health/cleanup-orphans` — 清理孤立 chunk

---

## 9. 监控告警（v0.9.0）🆕

### `GET /api/v1/kb/monitor/dashboard` — 监控看板聚合数据
```json
// Response
{
  "routing_stats": {...}, "llm_stats": {...},
  "routing_trend": [...], "token_trend": [...],
  "llm_latency_dist": [...], "kb_heatmap": [...],
  "system_events": [...], "insight_concept_stats": {...}
}
```

### `GET /api/v1/kb/monitor/events?category=&event=&page=1&page_size=50` — 事件分页列表
### `GET /api/v1/kb/monitor/alerts` — 活跃告警列表
### `GET /api/v1/kb/monitor/alert-config` — 告警规则配置
### `PUT /api/v1/kb/monitor/alert-config` — 更新告警规则
### `POST /api/v1/kb/monitor/alerts/{event_id}/resolve` — 解除单条告警
### `POST /api/v1/kb/monitor/alerts/resolve-all` — 全部已读

---

## 10. 统计与系统

### `GET /api/v1/kb/stats/overview` — 全局统计概览
### `GET /api/v1/kb/stats/frequent-questions?top_n=10` — 高频问题
### `GET /api/v1/kb/stats/unanswered` — 待补充问题
### `GET /api/v1/health` — 服务健康检查
### `GET /api/v1/health/system` — 系统信息（CPU/内存）

---

## 11. 配置管理

### `GET /api/v1/kb/config` — 系统全局配置
### `PUT /api/v1/kb/config` — 更新系统全局配置
### `GET /api/v1/kb/config/ollama-models` — 扫描 Ollama 可用模型

---

## 12. Vault 导入

### `POST /api/v1/kb/vaults/import` — 路径扫描导入
### `POST /api/v1/kb/vaults/upload` — 文件夹拖拽上传

---

## 13. 错误码约定

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 参数校验失败 |
| 2001 | 文档不存在 |
| 2002 | 文档格式不支持 |
| 2003 | 文档大小超出限制 |
| 2004 | 文档状态无效 |
| 3001 | 会话不存在 |
| 4001 | 未找到相关知识（检索无结果） |
| 5001 | 大模型调用失败 |
| 5002 | Embedding 模型不可用 |
| 6001 | 知识库不存在 |
| 6002 | 切片不存在 |
| 6003 | 知识点不存在 |
| 7001 | 外部推送认证失败 |
| 9001 | 服务内部错误 |

---

## 14. 前端 ↔ 后端类型映射

| 前端 TypeScript | 后端 Pydantic | 说明 |
|-----------------|--------------|------|
| `KnowledgeBase` | `KbInfo` | 对齐，新增后端接口 |
| `DocumentRecord` | `DocumentResponse` | kbId 现在来自后端 |
| `Message` | `ChatMessage` | 新增 thinkingSteps / roundKey |
| `Citation` | `RefChunk` | 前端计算 index |
| `Insight` | `InsightResponse` | 🆕 知识点 |
| `Concept` | `ConceptResponse` | 🆕 概念术语 |
| `HealthReport` | `HealthReportResponse` | 🆕 健康报告 |
| `DashboardData` | `DashboardData` | 🆕 监控看板 |
| `MonitorEvent` | `MonitorEventResponse` | 🆕 监控事件 |
| `Conversation` | `Session` | id → session_id |
| `SystemConfig` | `ConfigResponse` | llm_model 等动态字段 |
