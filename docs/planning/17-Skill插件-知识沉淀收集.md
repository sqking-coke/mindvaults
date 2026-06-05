# Skill插件 - 知识沉淀收集

> 状态：✅ 已实现（与原始方案有简化） | 创建：2026-06-02 | 更新：2026-06-05 | 关联：[[16-对话知识沉淀]] [[18-Skill插件开发计划]]
>
> **实际实现 vs 原始方案的关键简化：**
> - API Key：per-KB → 全局 `system_config.external_api_key`（migration 0015）
> - 沉淀库：独立 KB → 统一系统 KB（id=1）
> - kb_type 默认：`normal` → `general`
> - 推送响应：`entries` → `entry_ids` + `skipped`
> - 配置响应：扁平化（无 `skill_config` 嵌套）+ `kb_name`

## 定位

Skill 是知识沉淀系统的**外部收集入口**。mindvaults 用户安装对应 LLM 平台的 skill 插件后，平台上的对话自动推送到自己的沉淀库，走提炼 + 审核管道，最终分配到目标知识库。

Skill 不做权限管理、不做多 KB 路由——所有外部对话统一进沉淀库，用户在 mindvaults 端审核后再分配。

---

## 整体架构

```
┌─ 外部 LLM 平台 ──────────────────────────────────────────┐
│                                                          │
│  Claude Code / Copilot CLI / ChatGPT ...                 │
│  ┌────────────────────────────────────────────┐          │
│  │  mindvaults skill (平台原生插件)             │          │
│  │                                            │          │
│  │  监听对话结束 → 收集 QA → POST /external/push│          │
│  │  - 默认自动开启                             │          │
│  │  - 用户可 /mindvaults off 暂停              │          │
│  │  - 用户可 /mindvaults on 恢复               │          │
│  │  - 用户可 /mindvaults push 手动推送当前会话  │          │
│  └────────────────────────────────────────────┘          │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS + KB API Key
                       ▼
┌─ mindvaults 沉淀系统 ────────────────────────────────────┐
│                                                          │
│  沉淀专用 KB (type=deposition, 系统自动创建)               │
│  ┌──────────────────────────────────────────┐            │
│  │  kb_external_entries (外部对话暂存)        │            │
│  │       │                                   │            │
│  │       ▼ 定时提炼 (复用 #16 提炼管道)        │            │
│  │  kb_insights (提炼知识点, pending)          │            │
│  │       │                                   │            │
│  │       ▼ 用户审核 + 分配目标 KB              │            │
│  │  ┌──────────┬──────────┬──────────┐       │            │
│  │  │ 移入      │ 移入      │ 留在      │ 拒绝   │            │
│  │  │ Python库  │ 产品PRD库 │ 沉淀库    │        │            │
│  │  └──────────┴──────────┴──────────┘       │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  内部 QA (kb_qa_records) ──── 同样走提炼管道 ──────┘      │
└──────────────────────────────────────────────────────────┘
```

---

## 关键设计决策

| 决策 | 结论 |
|------|------|
| Skill 定位 | 用户主动安装的对话收集插件，用户有感知、可控制 |
| 收集粒度 | 支持单条 QA 和完整会话两种模式，skill 端可配 |
| 行为模式 | **混合**：默认自动收集，用户可 `/mindvaults off/on` 控制 |
| 目标 KB | 不开放指定，统一推入沉淀专用 KB，用户后续在审核页面分配 |
| 认证 | **全局 external_api_key**：存在 `system_config.external_api_key`，启动时自愈生成（实际实现简化，不再 per-KB） |
| 沉淀库 | 统一使用系统 KB（id=1），不单独创建沉淀库（实际实现简化） |
| 审核后 | 作为 `kb_chunks` 插入目标 KB（绑定虚拟文档），沉淀库保留原 insight 副本 |
| 平台 | 先做 **Claude Code Skill**，后续抽象通用 API 适配其他平台 |

---

## 数据库改动

### `kb_knowledge_bases` 加类型区分

```sql
ALTER TABLE kb_knowledge_bases
  ADD COLUMN kb_type VARCHAR(20) NOT NULL DEFAULT 'general';
  -- 'general' = 普通知识库
  -- 'deposition' = 知识沉淀库
```
> ✅ 已实现：migration 0011，默认值 `general`

### `kb_external_entries` — 外部对话暂存表

```sql
CREATE TABLE kb_external_entries (
    id              BIGSERIAL PRIMARY KEY,
    kb_id           BIGINT NOT NULL REFERENCES kb_knowledge_bases(id) ON DELETE CASCADE,
    
    -- 对话内容
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    messages_json   JSONB,                           -- 完整多轮消息（可选，完整会话模式）
    
    -- 来源信息
    source_platform VARCHAR(50) NOT NULL,             -- claude_code / copilot / chatgpt
    source_session  VARCHAR(255),                     -- 外部平台的会话 ID
    
    -- 处理状态
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / extracted / skipped
    
    pushed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_at    TIMESTAMPTZ,                     -- 被提炼的时间
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_external_entries_kb ON kb_external_entries(kb_id);
CREATE INDEX idx_external_entries_status ON kb_external_entries(status);
CREATE UNIQUE INDEX idx_external_entries_dedup 
    ON kb_external_entries(source_platform, source_session, question);
```

### `kb_insights` 补充字段（在 #16 基础上）

```sql
-- 在 16-对话知识沉淀.md 设计的 kb_insights 表基础上，增加：
ALTER TABLE kb_insights
  ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'native';
  -- 'native' = 来自内部 QA
  -- 'external' = 来自外部对话

ALTER TABLE kb_insights
  ADD COLUMN external_entry_ids BIGINT[];   -- 关联 kb_external_entries.id
```

---

## API 设计

### `POST /api/v1/kb/external/push`

Skill 端调用的唯一入口。

```
Header:
  Authorization: Bearer <deposition_kb_api_key>

Body:
{
  "platform": "claude_code",          // 来源平台标识
  "session_id": "abc123",             // 外部会话 ID
  "messages": [                       // 完整多轮消息（可选模式）
    {"role": "user", "content": "什么是 GIL"},
    {"role": "assistant", "content": "GIL 是..."}
  ],
  "qa_pairs": [                       // 精简 QA 对（单条模式）
    {
      "question": "什么是 GIL",
      "answer": "GIL 是 CPython..."
    }
  ]
}

Response:
{
  "code": 0,
  "data": {
    "received": 2,                    // 接收条数
    "skipped": 0,                     // 去重跳过的条数
    "entry_ids": [123, 124]           // 创建的 entry ID
  }
}
```
> ✅ 已实现：字段名 `entry_ids`（比计划更精确），新增 `skipped` 字段
```

**去重**：`source_platform + source_session + question` 组合唯一，重复推送自动跳过。

### `GET /api/v1/kb/deposition/config`

获取沉淀库的 API Key 和状态。

```
Response:
{
  "code": 0,
  "data": {
    "kb_id": 1,
    "kb_name": "默认系统库",            // ✅ 已实现：返回系统 KB 名称
    "api_key": "mv-dep-xxxxxxxxxxxx",   // 仅返回一次（创建时）
    "entry_count": 128,
    "pending_insights": 5,
    "endpoint": "https://your-instance.com/api/v1/kb/external/push"
  }
}
```
> ✅ 已实现：扁平化（无 `skill_config` 嵌套），前端自己拼配置命令；新增 `kb_name` 字段
```

### `POST /api/v1/kb/deposition/key/rotate`

轮换 API Key（Key 泄露时用）。

---

## Claude Code Skill 设计

### 安装方式

用户在自己的 Claude Code 中配置：

```bash
# 方式 1：通过 skill 市场（未来）
claude skills install mindvaults-glean

# 方式 2：手动配置（初期）
mkdir -p ~/.claude/skills/mindvaults-glean
# 将 skill.md 和 settings hook 放入该目录
```

### Skill 结构

```
~/.claude/skills/mindvaults-glean/
├── skill.md           # Skill 定义（用途、命令、配置说明）
└── CLAUDE.md          # Hook 配置（自动收集逻辑）
```

### 核心命令

| 命令 | 功能 |
|------|------|
| `/mindvaults on` | 开启自动收集 |
| `/mindvaults off` | 暂停自动收集 |
| `/mindvaults push` | 手动推送当前会话 |
| `/mindvaults status` | 查看收集状态（今日已推 N 条） |

### 自动收集逻辑（通过 Claude Code Stop Hook）

```
每次对话回合结束 (Stop hook 触发)
    │
    ▼
检查收集开关（~/.claude/mindvaults/state.json 中的 enabled 字段）
    │ 关闭 → 跳过
    │ 开启 ↓
    ▼
提取本轮 QA 对
    │
    ▼
POST /api/v1/kb/external/push
    │ 成功 → 静默处理
    │ 失败 → 记录到 ~/.claude/mindvaults/pending.json（重试队列）
```

### Skill 配置文件

```json
// ~/.claude/mindvaults/config.json
{
  "endpoint": "https://your-instance.com/api/v1/kb/external/push",
  "api_key": "mv-dep-xxxxxxxxxxxx",
  "enabled": true,
  "mode": "auto",           // auto | manual
  "collect_full_session": false  // false=单条QA | true=完整会话
}
```

### 状态文件

```json
// ~/.claude/mindvaults/state.json
{
  "enabled": true,
  "today_pushed": 15,
  "last_push_at": "2026-06-02T14:30:00Z",
  "pending_retry": 0
}
```

### 数据隐私

- API Key 存在本地 `~/.claude/mindvaults/config.json`，不离开用户机器
- 对话内容通过 HTTPS 加密传输
- 用户可随时 `off` 暂停收集
- 本地保留 7 天推送历史用于重试，过期自动清理

---

## 用户审核 + 分配流程

```
┌─ 审核中心 ──────────────────────────────────────────────┐
│                                                          │
│  待审核 (5)  │  已分配 (12)  │  留在沉淀库 (3)            │
│                                                          │
│  ┌──────────────────────────────────────────────┐        │
│  │ 💡 GIL 限制及解决方案        来源: 外部对话    │        │
│  │                          Claude Code / 昨天   │        │
│  │ CPython 的全局解释器锁（GIL）...              │        │
│  │                                               │        │
│  │ 分配到: [Python 技术文档 ▼]                   │        │
│  │ 标签: #python #GIL                            │        │
│  │                                               │        │
│  │ [✓ 批准并移入 Python 技术文档]  [留在沉淀库]   │        │
│  │ [✗ 拒绝]  [✏️ 编辑]                           │        │
│  └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

批准后：
1. 为「Python 技术文档」KB 创建一个虚拟文档 `__deposition__`（如不存在）
2. insight.content → embed → 插入 `kb_chunks`（`document_id` 指向虚拟文档）
3. insight.status → `approved`
4. 沉淀库保留 insight 记录（可追溯）

---

## 与 #16 的关系

| 维度 | #16 对话知识沉淀 | 本文 Skill 集成 |
|------|-----------------|----------------|
| 数据源 | `kb_qa_records`（内部问答） | `kb_external_entries`（外部对话） |
| 入口 | 用户使用 mindvaults 自带问答 | Skill 插件在外部 LLM 平台收集 |
| 提炼管道 | 同一个定时任务 + 同一个 LLM 提炼 prompt | ← 复用 |
| 审核 | 同一个审核中心 | ← 复用 |
| 入库 | 审核通过 → 分配 → `kb_chunks` | ← 复用 |

两者共享沉淀 KB、提炼管道和审核中心，区别仅在于数据来源和收集入口。

---

## 监控埋点

> 详细设计见 [[21-监控告警系统]]

| event | status | 触发条件 |
|-------|--------|---------|
| `external_push_received` | success | 收到外部推送 |
| `external_push_deduped` | warning | 推送去重跳过 |
| `external_push_failed` | failed | 推送处理失败 |
| `external_api_key_invalid` | failed | API Key 无效 |

---

## 实施计划

| 阶段 | 内容 | 涉及 |
|------|------|------|
| **Step 1** | 沉淀 KB 基础设施 | Alembic 迁移（`kb_type` + `kb_external_entries` + `kb_insights`）、自动创建沉淀库逻辑 |
| **Step 2** | 提炼管道 | `insight_service.py`（LLM 提炼 + 去重 + embedding）、定时任务 |
| **Step 3** | 外部推送 API | `POST /api/v1/kb/external/push` + API Key 管理 + 去重 |
| **Step 4** | 审核中心 | 审核列表 + 分配目标 KB + 批准/拒绝 |
| **Step 5** | 检索集成 | `retrieval_service` 联合检索 chunks + insights |
| **Step 6** | Claude Code Skill | skill.md + Stop hook + 本地配置 + 命令 |
| **Step 7** | 通用化 | 其他平台按需适配（Copilot CLI、ChatGPT 等） |

---

## 待讨论

- [ ] 沉淀库的 API Key 生成方式：随机字符串？JWT？长度？
- [ ] Skill 端推送失败的重试策略：指数退避？最大重试几次？
- [ ] 要不要提供 `GET /api/v1/kb/deposition/stats` 统计端点，让 skill 端能展示"今日已推 N 条"？
