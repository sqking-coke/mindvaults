# main → demo 合并注意事项

> 每次 main 有功能更新需要合入 demo 时，先读这个文件。

## 两个分支的核心差异

| 维度 | main | demo |
|------|------|------|
| 定位 | 正式产品 | 演示体验（预置数据，禁止上传） |
| 会话创建 | `db.add(session)` 正常写入 | `id=0` 不持久化 |
| API 鉴权 | 正常 | `IP 黑名单中间件` |
| 种子数据 | 无 | `seed.py` 预置 3 个 KB + 文档 |
| 部署 | 标准 compose | `demo` profile |

## 合并策略（按文件）

### 后端 — 直接取 main

| 文件 | 策略 | 原因 |
|------|------|------|
| `app/services/retrieval_service.py` | 取 main | insight 联合检索，demo 无特殊逻辑 |
| `app/services/embedding_service.py` | 取 main | resolve_embedding_config，demo 无特殊逻辑 |
| `app/services/ingestion_service.py` | 取 main | 概念抽取集成，demo 无特殊逻辑 |
| `app/services/llm_service.py` | 取 main | demo 无特殊逻辑 |
| `app/services/reranker_service.py` | 取 main | demo 无特殊逻辑 |

### 后端 — 需要合并

| 文件 | 策略 |
|------|------|
| **`app/services/chat_service.py`** | 取 main，补充 demo 会话创建 |
| `app/models/system_config.py` | **两边字段都要**（LLM配置 + 路由/沉淀配置），import 加 `Boolean` |
| `app/models/config.py` | **保留 demo**（LLM 配置在 SystemConfig），但 embed 字段需 `Optional` + `String` import |
| `app/models/__init__.py` | 补上 main 新增的 model（如 `KbInsight`） |
| `app/api/v1/router.py` | **两者都要**：demo 有 `admin_router`，main 有 `insights_router` |
| `app/api/v1/config.py` | **两者都要**：demo 的 embed 响应 + main 的 route/insight 响应字段 |
| `app/api/v1/vault.py` | **两者都要**：demo 的 `settings` import + main 的 `InternalError` import |
| **`app/main.py` (lifespan)** | **保留 demo** 的数据迁移代码（CREATE TABLE IF NOT EXISTS + kb_config → system_config），但 CREATE TABLE 里要补 main 新增的字段（route_centroid_threshold 等） |

### chat_service.py 合并要点（最重要）

```
取 main 的版本，在会话创建处加 demo 守卫：

if session is None:
    is_demo = settings.DEMO_MODE
    if is_demo:
        session = KbSession(..., id=0)       # ← demo 特供
    else:
        session = KbSession(...)             # ← 正常
        db.add(session)
        await db.flush()
        await db.commit()
```

### 前端 — 全部取 main

前端 demo 特有代码少（Banner 等），取 main 版本基本不会丢。如果丢了再补。

### 文档 — 全部取 main

| 文件 | 策略 |
|------|------|
| `docs/planning/05-数据库设计-实施详细设计.md` | **删掉**（main 已删） |
| 其余 docs/planning/*.md | 取 main |

## 合并后检查清单

- [ ] `python -c "from app.models.config import KbConfig"` — 确保 Optional/String import
- [ ] `python -c "from app.main import app"` — 确保所有 import 链路
- [ ] 检查 `system_config` 表结构是否包含 demo 迁移字段 + main 新增字段
- [ ] 检查 router.py 是否注册了 insights_router + admin_router
- [ ] 检查 chat_service.py 是否有 DEMO_MODE 会话创建守卫
- [ ] `npx next build --no-lint` 前端编译通过
