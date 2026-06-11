# 推理过程 Redis 缓存设计

> 版本：v1.0 | 状态：✅ 已实施 | 关联：05-数据库设计.md

## 1. 背景

### 现状

- 实时问答时，后端通过 SSE `progress` 事件推送推理步骤，前端 `Message.thinkingSteps` 实时展示 ✅
- 刷新页面或加载历史对话后，`thinkingSteps` 丢失 ❌
- 推理过程属于临时展示数据，不需要永久存储到 PostgreSQL

### 设计目标

- 推理过程跟随 session 生命周期
- 存储在 Redis，Key 绑定 `session_id`
- 删除 session 时同步清除
- TTL 自动过期（默认 7 天，私有部署可设更长）
- 零数据库 schema 变更

## 2. Redis 数据结构

### Key 设计

```
mv:thinking:{session_uuid}
```

- 类型：`LIST`
- 元素：JSON 字符串（每个 progress 事件一条）
- TTL：`604800` 秒（7 天），可通过环境变量 `THINKING_TTL_SECONDS` 配置

### 操作

```
# 写入（chat_stream 中每个 progress 事件）
LPUSH mv:thinking:{session_uuid} '{"phase":"intent","message":"...","elapsed_ms":0}'
EXPIRE mv:thinking:{session_uuid} 604800

# 读取（前端加载历史时）
LRANGE mv:thinking:{session_uuid} 0 -1
# 返回: [最旧的 step, ..., 最新的 step]

# 删除（删除 session 时）
DEL mv:thinking:{session_uuid}
```

> 用 `LPUSH` 写入，读取时用 `LRANGE 0 -1` 拿到完整列表。列表自然按时间倒序，前端拿到后 `reverse()` 还原时间正序。

### Key 数量估算

- 每个活跃 session 一个 Key
- 私有部署用户量小，100 个 session × 每条 8 个 step × 200 字节 ≈ 160KB
- Redis 内存压力可忽略

## 3. 数据流

### 3.1 写入（实时问答）

```
chat_stream()
  │
  ├─ progress #1: "正在分析问题意图..."
  │   → LPUSH mv:thinking:{session_id} '{"phase":"intent",...}'
  │   → EXPIRE mv:thinking:{session_id} 604800
  │   → SSE yield progress
  │
  ├─ progress #2: "正在将问题转换为向量表示..."
  │   → LPUSH ...
  │
  ├─ ... (共 6-8 个 progress)
  │
  └─ done event:
      → data.ref_chunks + data.thinking_key = "mv:thinking:{session_id}"
```

### 3.2 读取（加载历史 / 刷新页面）

```
前端:
  GET /api/v1/kb/chat/thinking/{session_id}
    │
后端:
  LRANGE mv:thinking:{session_id} 0 -1
  → 返回 JSON 数组 [{step1}, {step2}, ...]
  → 不存在或过期 → 返回空数组 []
```

### 3.3 清理

```
delete_session(session_id):
  ① DELETE FROM kb_qa_records WHERE session_id = ...
  ② DELETE FROM kb_sessions WHERE id = ...
  ③ DEL mv:thinking:{session_id}     ← 同步清理 Redis

Redis TTL 兜底:
  → 7 天后自动过期（防御性清理）
```

## 4. API 端点

### `GET /api/v1/kb/chat/thinking/{session_id}`

```
Response 200:
{
  "code": 0,
  "data": {
    "session_id": "uuid",
    "steps": [
      {"phase": "intent", "message": "正在分析问题意图...", "elapsed_ms": 0},
      {"phase": "retrieval", "message": "正在将问题转换为向量表示...", "elapsed_ms": 5},
      ...
    ]
  }
}
```

Redis key 不存在时返回空 `steps: []`，不报 404。

## 5. 后端变更清单

| 文件 | 操作 | 改动 |
|------|------|------|
| `app/services/chat_service.py` | 修改 | `chat_stream()` 中每次 progress → `LPUSH` Redis |
| `app/services/chat_service.py` | 修改 | `done` 事件新增 `thinking_key` 字段 |
| `app/services/chat_service.py` | 修改 | `delete_session()` → `DEL` Redis key |
| `app/api/v1/chat.py` | 新增路由 | `GET /chat/thinking/{session_id}` |
| `app/config.py` | 新增字段 | `THINKING_TTL_SECONDS: int = 604800` |

无数据库迁移、无模型变更、无 Schema 变更。

## 6. 前端变更清单

| 文件 | 操作 | 改动 |
|------|------|------|
| `src/services/ragService.ts` | 新增函数 | `fetchThinkingSteps(sessionId)` |
| `src/context/mindvaultsContext.tsx` | 修改 | 加载历史时调 `fetchThinkingSteps` 回填 `thinkingSteps` |

无类型变更、无组件变更。

## 7. 对比：Redis vs DB 方案

| 维度 | Redis（本方案） | PostgreSQL（之前擅自改的） |
|------|-----------|---------------------|
| Schema 变更 | 无 | +JSONB 列 + migration |
| 数据性质 | 临时/会话级，符合 TTL | 永久存储 |
| 清理 | TTL 自动 + delete_session 同步删 | 跟随 QA record 级联删 |
| 查询 | LRANGE O(N) | SELECT JSONB |
| 运维 | 重启不丢（Redis RDB/AOF） | 数据库备份自然携带 |
| 实现量 | 1 个 API + 3 处 Redis 调用 | 模型+Schema+Service+API+前端 |

## 8. 与 P1 实施顺序的关系

本改动独立于多 KB 实施，可以在任意顺序执行。建议：

```
多 KB 实施(Step 1-8) 完成后 → 本设计作为独立的 Step 9 实施
```

不阻塞、不依赖多 KB 改动。

## 9. 回滚

- Redis key 删除：`DEL mv:thinking:*`
- API 路由可随时移除，前端有 `|| []` 兜底
