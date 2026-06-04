# main → demo 合并操作手册

> 每次 main 有功能更新需要合入 demo 时，**严格按本文操作**。不要凭记忆、不要假设。

## 两个分支的核心差异

| 维度 | main | demo |
|------|------|------|
| 定位 | 正式产品 | 演示体验（预置数据，禁止操作） |
| 会话 | `db.add(session)` 正常写入 | `id=0` 不持久化到 DB |
| 鉴权 | API Key | IP 黑名单中间件 |
| 种子数据 | 无 | `seed_demo.py` 预置 3 KB + 文档 |
| 系统信息 | 实时获取 | 硬编码 Apple M4 Ultra / 256GB |
| 知识库操作 | 允许增删 | 阻止增删（toast 提示） |
| 前端 env | 无特殊要求 | `NEXT_PUBLIC_DEMO_MODE=true` |

---

## 一、后端合并策略

### 1.1 直接取 main（demo 无特殊逻辑）

```
app/services/retrieval_service.py   — insight 联合检索
app/services/embedding_service.py   — resolve_embedding_config
app/services/ingestion_service.py   — 概念抽取集成
app/services/llm_service.py
app/services/reranker_service.py
```

### 1.2 必须手动合并（两边都有特殊代码）

| 文件 | 操作 |
|------|------|
| **`app/services/chat_service.py`** | 取 main 版本，然后在会话创建处加 `is_demo` 守卫（见 1.3） |
| **`app/main.py`** | **保留 demo 的 lifespan**（含 CREATE TABLE IF NOT EXISTS + kb_config→system_config 迁移），但补上 main 新增的 system_config 字段 |
| `app/models/system_config.py` | **两边字段都保留**：demo 的 LLM/Embedding 字段 + main 的 route/insight 字段。import 加 `Boolean` |
| `app/models/config.py` | **保留 demo 版本**（不含 LLM 字段，已在 SystemConfig），但确保 import 有 `Optional` 和 `String` |
| `app/models/__init__.py` | 补 main 新增的 model（如 `KbInsight`） |
| `app/api/v1/router.py` | **两者都注册**：`admin_router`（demo）+ `insights_router`（main） |
| `app/api/v1/config.py` | **两者都要**：demo 的 embed 响应 + main 的 route/insight 响应字段 |
| `app/api/v1/vault.py` | **两者都要**：`from app.config import settings`（demo）+ `from app.core.exceptions import InternalError`（main） |
| `app/seed_demo.py` | **保留 demo 版本**，但 DELETE 后必须 `INSERT ... ON CONFLICT DO NOTHING` 重建 id=1 默认系统库 |

### 1.3 chat_service.py 合并模板

```
以 main 版本为基础，在会话创建处改造：

if session is None:
    is_demo = settings.DEMO_MODE        # ← demo 守卫
    if is_demo:
        session = KbSession(..., id=0)  # ← demo：不持久化
    else:
        session = KbSession(...)        # ← 正常写入
        db.add(session)
        await db.flush()
        await db.commit()
```

---

## 二、前端合并策略

**NOT 全部取 main！** 以下文件有 demo 特有逻辑，取 main 会导致功能丢失：

### 2.1 有 demo 特有逻辑的文件（不能简单取 main）

| 文件 | demo 特有逻辑 | 合并方式 |
|------|-------------|---------|
| `src/components/layout/Sidebar.tsx` | **系统信息硬编码**：`useState` 初始值直接写 Apple M4 Ultra / 256GB，不调 `fetchSystemInfo` | 保留 demo |
| `src/components/kb/KBDashboard.tsx` | **删除按钮对所有 KB 可见**（包括 id=1），点击后 demo 模式弹 toast 阻止。不要加 `kb.id !== 1` 隐藏 | 保留 demo |
| `src/app/(app)/kb/page.tsx` | **SystemKBHome 保留**，id=1 系统库有专用首页。不要删除 | 保留 demo |
| `src/components/chat/ChatMessageList.tsx` | 需要 `isDemo` guard 跳过 API 调用，同时保留 main 的 `savedMessageIds` + `saveInsight` | 手动合并 |
| `src/context/mindvaultsContext.tsx` | `done` 事件需捕获 `qa_record_id` 写入 `Message.qaRecordId` | 手动合并 |

### 2.2 可以直接取 main 的文件

```
src/types/api.ts                    — 只需补 Message.qaRecordId 字段
src/app/(app)/chat/page.tsx
src/components/chat/ChatInputArea.tsx
src/components/chat/ConfigRequiredDialog.tsx
src/components/kb/DocumentTable.tsx
src/components/settings/SettingsPanel.tsx
src/components/insights/InsightReview.tsx   — 新文件
src/components/kb/SystemKBHome.tsx          — 新文件
src/app/(app)/kb/manage/page.tsx            — 新文件
```

---

## 三、文档合并策略

| 文件 | 操作 |
|------|------|
| `docs/planning/05-数据库设计-实施详细设计.md` | **删除**（main 已并入主文档） |
| 其余 `docs/planning/*.md` | 取 main |

---

## 四、合并后验证清单

### 后端
- [ ] `python -c "from app.models.config import KbConfig"` — Optional/String import
- [ ] `python -c "from app.main import app"` — 完整 import 链路
- [ ] `alembic upgrade head` — 迁移执行成功
- [ ] uvicorn 启动无报错

### 前端
- [ ] `npx next build --no-lint` 编译通过
- [ ] 侧边栏系统信息显示 M4 Ultra / 256GB（非真实值）
- [ ] 知识中心所有 KB 可见删除按钮，点击弹 toast 阻止
- [ ] 系统库 (id=1) 显示 SystemKBHome 专用首页
- [ ] 对话页保存到知识库不报错

### 种子数据
- [ ] `POST /api/v1/admin/seed-demo` 执行后 id=1 默认系统库存在

---

## 五、已踩过的坑

1. **config.py 缺 import**：保留 demo 版本时，embedding 字段用了 `Optional[str]` 和 `String(50)`，必须补 `from typing import Optional` 和 `String`
2. **system_config 表不存在**：demo 靠 lifespan 建表而非 alembic，清库后需先手动建表或启动一次 uvicorn 再跑迁移
3. **seed_demo 删光 KB**：DELETE 后立即 `INSERT id=1` 重建默认系统库
4. **save-insight 用 Date.now() 当 DB ID**：必须后端 done 事件返回 `qa_record_id`，前端 `Message.qaRecordId` 存储
5. **前端不能全部取 main**：Sidebar、KBDashboard、KB page 有 demo 硬编码逻辑，取 main 会丢失
6. **系统状态固定硬编码**：Sidebar 的 `systemInfo` 初始值直接写 Apple M4 Ultra / 256GB，不调 `fetchSystemInfo`，不要改成环境变量判断
6. **不要删 SystemKBHome**：id=1 系统库专用首页是功能设计，不是 bug
