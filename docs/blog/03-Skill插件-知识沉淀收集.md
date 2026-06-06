# mindvaults-glean：把 Claude Code 的每一次对话，自动沉淀到你的知识库

> mindvaults 的对话知识沉淀系统只能收集平台自带的问答。本文记录 **mindvaults-glean** 插件的技术方案——如何在 Claude Code 中安装一个 Skill 插件，让外部 LLM 平台的对话自动推送到你的本地知识库，走统一的提炼 + 审核管道。


## 一、问题

当前的知识沉淀入口只有一个：mindvaults 自带的 Chat 页面。用户在这里提问，LLM 回答，点击「保存到知识库」，走提炼管道进入审核中心。

但现实是——大量高价值的 AI 对话**不发生在自己的平台里**。用户在 Claude Code 里讨论架构设计，在 Copilot CLI 里调试代码，在 ChatGPT 里研究技术方案。这些对话散落在各个平台，想沉淀下来只能手动复制粘贴。

```
Claude Code  ──── 对话结束，知识流失
Copilot CLI  ──── 对话结束，知识流失
ChatGPT      ──── 对话结束，知识流失

mindvaults   ──── 只有内置 Chat 的对话能被收集
```

核心矛盾：**最有价值的知识往往产生在外部工具中，但沉淀系统只能收集自己平台的内容。**


## 二、方案设计

### 2.1 核心思路

不给每个平台做独立 SDK，而是做一个 Claude Code **Skill 插件——mindvaults-glean**。用户安装后，每次对话结束，Stop hook 自动收集本轮 QA 对，POST 到自己的 mindvaults 实例。

为什么不先做独立集成而是走插件？三个原因：

1. **零侵入**：Skill 是 Claude Code 的原生扩展机制，不需要改 Claude Code 源码
2. **用户可控**：`/mindvaults-glean on` 开启，`/mindvaults-glean off` 暂停，完全自主
3. **复用管道**：推送只是入口，后续提炼、去重、审核、入库完全复用现有的 insight 管道

### 2.2 整体架构

```
┌─ Claude Code ──────────────────────────────────────────────┐
│                                                             │
│  每次对话回合结束 (Stop hook)                                 │
│       │                                                     │
│       ▼                                                     │
│  push-qa.sh 检查 enabled 开关                                │
│       │ 关闭 → 静默退出                                      │
│       │ 开启 ↓                                              │
│  POST /api/v1/kb/external/push                              │
│  Header: Authorization: Bearer <external_api_key>           │
│  Body: { platform, session_id, qa_pairs }                   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─ mindvaults 系统库 (id=1) ─────────────────────────────────┐
│                                                             │
│  kb_external_entries (外部对话暂存)                          │
│       │                                                     │
│       │ 定时提炼 (复用 insight_service 提炼管道)              │
│       ▼                                                     │
│  kb_insights (提炼知识点, status=pending)                    │
│       │                                                     │
│       ▼ 审核中心                                             │
│  ┌──────────┬──────────┬──────────┐                        │
│  │ 通过→KB A │ 通过→KB B │ 拒绝     │                        │
│  └──────────┴──────────┴──────────┘                        │
│                                                             │
│  内部 QA (kb_qa_records) ──── 同一条提炼管道 ────┘          │
└─────────────────────────────────────────────────────────────┘
```

本地 QA 和外部 Skill 统一走系统库，不再额外创建沉淀 KB。区别仅在于数据来源——前者来自 `kb_qa_records`，后者来自 `kb_external_entries`。两条来源汇入同一条提炼管道后，`kb_insights.source_type` 字段（`native` | `external`）标记最终来源，实现端到端可追溯——在审核中心可随时知道一条知识点是来自内部对话还是外部 Skill 推送。

### 2.3 为什么推送是静默的

推送全程不打断对话。成功不提示（用户不需要知道每条 QA 都推送了），失败不阻塞（记录到 pending 队列，下次重试）。

唯一可见的反馈是 `/mindvaults-glean status` 命令——用户主动查询时才显示"今日已推送 15 条"。


## 三、Skill 插件设计

### 3.1 文件结构

```
mindvaults-glean/
├── SKILL.md              # 技能定义
├── hooks/
│   ├── hooks.json        # Stop hook 配置
│   └── push-qa.sh        # 推送脚本
├── .claude-plugin/
│   └── plugin.json       # 插件清单
└── README.md
```

### 3.2 Stop Hook 脚本

每次对话回合结束，Claude Code 触发 Stop hook，执行推送脚本：

```bash
#!/bin/bash
CONFIG="$HOME/.claude/mindvaults/config.json"

# 检查开关
enabled=$(jq -r '.enabled // false' "$CONFIG")
if [ "$enabled" != "true" ]; then
  exit 0  # 静默退出
fi

# 防止 Stop hook 无限循环
if [ "${CLAUDE_STOP_HOOK_ACTIVE:-0}" = "1" ]; then
  exit 0
fi

endpoint=$(jq -r '.endpoint' "$CONFIG")
api_key=$(jq -r '.api_key' "$CONFIG")

# 提取本轮 QA
question=$(jq -r '.last_user_message // ""' "$CLAUDE_TRANSCRIPT_PATH")
answer=$(jq -r '.last_assistant_message // ""' "$CLAUDE_TRANSCRIPT_PATH")

# 推送到 mindvaults
curl -s -X POST "${endpoint}/api/v1/kb/external/push" \
  -H "Authorization: Bearer ${api_key}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$question" --arg a "$answer" \
    '{platform: "claude_code", qa_pairs: [{question: $q, answer: $a}]}')"

exit 0  # 始终返回 0，不打断对话
```

### 3.3 用户命令

| 命令 | 功能 |
|------|------|
| `/mindvaults-glean on` | 开启自动收集 |
| `/mindvaults-glean off` | 暂停收集 |
| `/mindvaults-glean push` | 手动推送当前会话 |
| `/mindvaults-glean status` | 查看今日推送统计 |

### 3.4 用户配置文件

```json
// ~/.claude/mindvaults/config.json
{
  "endpoint": "https://your-instance.com",
  "api_key": "mv-dep-xxxxxxxxxxxx",
  "enabled": true
}
```

端点地址和 API Key 在 mindvaults 设置页面获取，用户首次配置只需一行。


## 四、后端 Push API

### 4.1 端点设计

```http
POST /api/v1/kb/external/push
Authorization: Bearer <external_api_key>

{
  "platform": "claude_code",
  "session_id": "abc123",
  "qa_pairs": [
    {"question": "什么是 GIL", "answer": "GIL 是全局解释器锁..."},
    {"question": "Python 装饰器原理", "answer": "装饰器是一种语法糖..."}
  ]
}
```

```json
// Response
{
  "code": 0,
  "data": {
    "received": 1,       // 成功接收
    "skipped": 1,        // 去重跳过
    "entry_ids": [42]    // 创建的 entry ID
  }
}
```

### 4.2 鉴权

不使用全局 API Key，而是独立的 `external_api_key`。这个 Key 只对 push 端点有效，泄露不影响知识库的其他操作。Key 存储在 `system_config` 表中，支持轮换。

```python
# 验证逻辑
async def _validate_external_key(db: AsyncSession, api_key: str) -> bool:
    sys_cfg = await db.get(SystemConfig, 1)
    return sys_cfg and sys_cfg.external_api_key == api_key
```

| 场景 | HTTP 状态码 |
|------|------------|
| 无 Authorization header | 401 |
| Key 不匹配 | 403 |
| 正常推送 | 200 |

### 4.3 去重

同 platform + 同 session_id + 同 question 的推送自动跳过，返回 `skipped: 1`。去重用代码层 SELECT 检查，而非数据库唯一约束——因为 `session_id` 可为 NULL，NULL ≠ NULL 在索引中不冲突。

```python
dup = await db.execute(
    select(KbExternalEntry.id).where(
        KbExternalEntry.kb_id == 1,
        KbExternalEntry.source_platform == platform,
        KbExternalEntry.source_session == session_id,
        KbExternalEntry.question == question,
    )
)
if dup.scalar_one_or_none() is not None:
    skipped += 1
    continue
```


## 五、数据模型

### 5.1 kb_external_entries

```sql
CREATE TABLE kb_external_entries (
    id              BIGSERIAL PRIMARY KEY,
    kb_id           BIGINT NOT NULL,              -- 固定为 1（系统库）
    
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    messages_json   JSONB,                        -- 完整多轮消息（可选）
    
    source_platform VARCHAR(50) NOT NULL,          -- claude_code / copilot / chatgpt
    source_session  VARCHAR(255),                  -- 外部会话 ID
    
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / extracted / skipped
    pushed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 与 kb_qa_records 的关系

两者共享提炼管道和审核中心，区别仅在于数据来源：

| 维度 | kb_qa_records | kb_external_entries |
|------|-------------|-------------------|
| 来源 | mindvaults 内置 Chat | 外部 Skill 插件 |
| 触发方式 | 每次问答自动保存 | Stop hook 主动推送 |
| 提炼管道 | 同一个 LLM prompt | ← 复用 |
| 审核 | 同一个审核中心 | ← 复用 |
| 入库 | 审核通过 → kb_chunks | ← 复用 |

提炼阶段的端到端来源追溯通过 `kb_insights` 的两个字段实现：

| 字段 | 说明 |
|------|------|
| `source_type` | `native`（本地 QA）或 `external`（外部 Skill） |
| `source_qa_ids` | 来源 QA 记录 ID 列表（native） |
| `external_entry_ids` | 来源外部条目 ID 列表（external） |

审核中心据此提供来源过滤（全部来源 / 本地 QA / 外部收集），用户可以在数据治理页面按来源维度筛选待审核知识点，便于区分内部对话提炼和 Skill 推送内容的审核优先级。


## 六、异常场景全覆盖

设计阶段没有只画 happy path。所有异常场景穷举出来，逐一给兜底：

| # | 场景 | 处理 |
|---|------|------|
| 1 | 用户关闭收集开关 | 脚本检查 enabled 字段，静默退出 |
| 2 | mindvaults 实例不可达 | curl 失败，记录到 pending.log，下次重试 |
| 3 | API Key 过期 | 返回 403，用户在设置页轮换 Key 后更新 config.json |
| 4 | 推送重复 QA | 数据库层去重，返回 skipped 而非报错 |
| 5 | question 或 answer 为空 | 跳过该条，不报错 |
| 6 | 单次推送 50+ 条 QA | Schema 限制 `max_length=50`，防止滥用 |
| 7 | Stop hook 触发自身 | 检查 `CLAUDE_STOP_HOOK_ACTIVE` 环境变量，为 1 则退出 |
| 8 | messages_json 过大 | JSONB 字段无硬性大小限制，超出 PG 默认 1GB 才报错 |
| 9 | external_api_key 未生成 | 首次调 config 端点自动生成 |


## 七、安全

三层防护：

```
第一层：独立 API Key
  external_api_key 只对 /api/v1/kb/external/push 有效
  即使泄露，攻击者只能往沉淀库推数据，不能读、不能删、不能访问其他 API

第二层：用户随时可关闭
  /mindvaults off 立即暂停收集
  /mindvaults status 查看推送统计，发现异常可轮换 Key

第三层：HTTPS + 本地存储
  对话内容通过 HTTPS 加密传输
  API Key 存储在用户本机 ~/.claude/mindvaults/config.json，不离开本地
```

Key 轮换端点 `POST /api/v1/kb/deposition/key/rotate`，旧 Key 立即失效，不影响已入库数据。


## 八、安装与分发

### 方式一：从 GitHub 安装（推荐）

```bash
# 在 Claude Code 中运行
/plugin install github.com/sqking-coke/mindvaults-glean
```

### 方式二：手动安装
```bash
mkdir -p ~/.claude/skills/mindvaults-glean
cp -r SKILL.md hooks/ commands/ references/ .claude-plugin/ ~/.claude/skills/mindvaults-glean/
```

### 首次配置

在 mindvaults 设置页获取 endpoint 和 API Key：

```bash
/mindvaults config --endpoint https://my-instance.com --api-key mv-dep-xxx
/mindvaults on
```

### 验证

```bash
/mindvaults status
# 今日已推送 0 条 | 收集状态: 开启 | 目标: https://my-instance.com
```


## 九、监控埋点

| event | status | 触发条件 |
|-------|--------|---------|
| `external_push_received` | success | 收到外部推送 |
| `external_push_deduped` | warning | 推送被去重跳过 |
| `external_push_failed` | failed | 推送处理失败 |
| `external_api_key_invalid` | failed | API Key 无效 |
| `external_key_rotated` | success | Key 已轮换 |

告警规则：连续 3 次 API Key 验证失败触发告警（可能是泄露或暴力尝试），单日去重率超过 50% 触发提醒（可能是重复推送逻辑问题）。


## 十、后续规划

| 阶段 | 内容 |
|------|------|
| Step 2 | Copilot CLI 适配（同架构，改 platform 标识） |
| Step 3 | 完整多轮会话推送（`messages_json` 字段已预留） |
| Step 4 | 推送仪表板（skill 端 `/mindvaults dashboard`） |
| Step 5 | 重试队列自动恢复（pending.log 定时重推） |
| Step 6 | ChatGPT Plugin 适配 |

---

同一系列的方案文档：KB 智能路由、对话知识沉淀、概念/术语关联、知识库内容再组织、监控告警系统已全部完成。Skill 插件是数据治理系统的最后一个收集入口——内部 QA、外部对话、Obsidian vault，三个入口汇入同一条提炼管道。

