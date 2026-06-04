# main → demo 合并约束

> main 有新功能合入 demo 时，先读本文。

## 核心差异

| | main | demo |
|---|------|------|
| 会话 | `db.add(session)` | `id=0` 不持久化 |
| 鉴权 | API Key | IP 黑名单 |
| 种子数据 | 无 | `seed_demo.py`（3 KB + 文档） |
| 系统信息 | 实时获取 | 硬编码 M4 Ultra / 256GB |
| 操作拦截 | 允许 | 阻止增删改，右下角 toast 提示 |
| isDemo | 无 | `useState(true)` 硬编码 |

---

## 后端

### 直接取 main
```
retrieval_service  embedding_service  ingestion_service  llm_service  reranker_service
```

### 手动合并

| 文件 | 操作 |
|------|------|
| `chat_service.py` | 取 main，在会话创建处加 `if settings.DEMO_MODE: KbSession(..., id=0)` |
| `main.py` lifespan | 保留 demo 的 CREATE TABLE + kb_config→system_config 迁移，补 main 新增字段 |
| `system_config.py` | 两边字段都保留（LLM/Embedding + route/insight），import 加 `Boolean` |
| `config.py` | 保留 demo（无 LLM 字段），import 补 `Optional` `String` |
| `__init__.py` | 补 main 新增 model（`KbInsight`） |
| `router.py` | `admin_router`(demo) + `insights_router`(main) 都注册 |
| `config.py` API | demo 的 embed 响应 + main 的 route/insight 字段 |
| `vault.py` | `from app.config import settings` + `from app.core.exceptions import InternalError` |
| `seed_demo.py` | DELETE kb_knowledge_bases 后 `INSERT id=1` 重建默认系统库 |
| `kb_service.py` | 删 KB 前手动 DELETE chunks→documents→sessions→qa_records，不能靠 ORM cascade |

---

## 前端（NOT 全部取 main）

### 保留 demo 的文件

| 文件 | 约束 |
|------|------|
| **`context/mindvaultsContext.tsx`** | `isDemo = useState(true)` 硬编码；`showToast` 类型含 `"warning"`；done 事件捕获 `qa_record_id` |
| **`layout/Sidebar.tsx`** | `systemInfo` 初始值硬编码 M4 Ultra/256GB，不调 fetchSystemInfo |
| **`kb/KBDashboard.tsx`** | 删除/新建按钮 isDemo 时 `showToast("warning")`；删除按钮对所有 KB 可见 |
| **`kb/UploadZone.tsx`** | 加 `onClick` 拦截，isDemo 时 `showToast("warning")` 阻止文件对话框弹出；`onDrop` `onFileSelect` 同样拦截 |
| **`app/kb/page.tsx`** | 保留 `SystemKBHome`；Obsidian 导入按钮 isDemo 时 `showToast("warning")` |
| **`chat/ChatMessageList.tsx`** | 保留 main 的 `savedMessageIds` + `saveInsight`，同时 isDemo 跳过 API 调用 |
| **`types/api.ts`** | 补 `Message.qaRecordId?: number` |

### 可取 main 的文件
```
chat/page   ChatInputArea   ConfigRequiredDialog   DocumentTable   SettingsPanel
InsightReview   SystemKBHome   kb/manage/page
```

---

## 验证清单

- [ ] `isDemo` 硬编码生效，所有拦截 toast 正常弹出
- [ ] 侧边栏系统信息显示 M4 Ultra / 256GB
- [ ] 点击上传框弹 toast，不弹文件对话框
- [ ] 拖拽文件弹 toast
- [ ] Obsidian 导入按钮弹 toast
- [ ] 删除/新建 KB 弹 toast
- [ ] 系统库 id=1 显示 SystemKBHome
- [ ] 对话页保存到知识库不报错
- [ ] seed-demo 后 id=1 存在
- [ ] 删除 KB 不报 NOT NULL

---

## 踩坑记录

1. **config.py** 保留 demo 时补 `Optional` `String` import
2. **system_config** demo 靠 lifespan 建表，清库后需启动 uvicorn 再跑 alembic
3. **seed_demo** DELETE kb_knowledge_bases 后 INSERT id=1
4. **save-insight** 后端 done 事件加 `qa_record_id`，前端 `Message.qaRecordId`，不用 Date.now()
5. **isDemo 硬编码** 每次 merge 必丢，检查 `useState(true)` 且在 context value 中
6. **showToast "warning"** main 只有 success/error，demo 阻止提示全是 warning，类型要补
7. **UploadZone onClick** 必须拦截在文件对话框之前，不是选完文件再提示
8. **demo 拦截用 toast 非 ConfirmDialog**，右下角弹出，3 秒自动消失
9. **kb_service 删 KB** SQLAlchemy ORM 会把 FK 置 NULL 而非 CASCADE DELETE，必须手动删子表
