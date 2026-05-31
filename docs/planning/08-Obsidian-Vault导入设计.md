# 08 - Obsidian Vault 导入设计

> 来源：docs/superpowers/specs/2026-05-30-obsidian-vault-scan-design.md | 状态：✅ 已实现

## 1. 需求概述

允许用户将本地 Obsidian Vault 目录的 `.md` 文件批量导入到指定知识库，复用现有摄入管道（解析 → 切片 → 向量化 → 入库）。

### 核心决策

| 决策项 | 选择 |
|--------|------|
| 导入方式 | 两种：路径扫描 + 文件夹拖拽上传 |
| 同步策略 | 一次性导入，变更后手动重新导入 |
| Obsidian 语法 | YAML frontmatter 解析存入 `doc_desc`，`[[wikilink]]` 转为纯文本 |
| 前端展示 | 复用现有文档列表，`source=obsidian` 区分 |

## 2. API 端点

### `POST /api/v1/kb/vaults/import` — 路径扫描

```json
// Request
{ "path": "/Users/xxx/MyObsidianVault", "source": "obsidian", "kb_id": 1 }
// Response
{
  "code": 0,
  "data": {
    "total_found": 142,
    "imported": 140,
    "failed": 2,
    "errors": [{ "file": "broken.md", "reason": "编码错误" }]
  }
}
```

### `POST /api/v1/kb/vaults/upload` — 拖拽上传

```
multipart/form-data: files[] + source + kb_id
```

## 3. 数据流

```
用户输入路径 / 拖入文件夹
  → 递归扫描 .md 文件（跳过 .obsidian / .git 等隐藏目录）
    → 每个文件:
      ① 读取内容
      ② 解析 YAML frontmatter → doc_desc
      ③ [[wikilink]] → 纯文本
      ④ 写入 uploads/ (UUID 文件名)
      ⑤ 创建 KbDocument (kb_id=X, source=obsidian)
      ⑥ 触发异步摄入 pipeline
    → 返回摘要
```

## 4. 前端交互

- KB 页面右侧 "批量导入 Obsidian Vault" 卡片
- 点击打开 VaultImportDialog 弹窗
- 两个 Tab：拖拽上传（推荐） / 路径扫描（极客模式）
- 导入完成展示结果摘要（总数、成功、失败明细）

## 5. 摄入管道（Ingestion Pipeline）

> 本节补充于 2026-05-31，覆盖所有文档摄入路径（vault 导入、普通上传、重索引）
> 重构方案 v2.0，2026-05-31 定稿

### 5.1 设计目标

摄入是离线后台任务，不需要可视化监控页面。目标：

1. **任务可靠**：服务重启不丢任务，自动恢复
2. **速度可控**：并发有上限，不撑爆 DB 连接池
3. **批量加速**：embedding 批量调用，一次 HTTP 处理所有 chunk
4. **失败自愈**：重试 + 指数退避，终态明确
5. **可观测**：状态机 + heartbeat 字段，方便查日志定位

### 5.2 目标架构

```
                    ┌─────────────────────────┐
                    │    TaskRegistry          │
                    │  (module-level dict)      │
                    │  doc_id → asyncio.Task    │
                    └──────────┬──────────────┘
                               │ register / deregister
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    schedule_ingestion   on_startup           Semaphore(3)
           │                   │                   │
           ▼                   ▼                   ▼
    asyncio.create_task   scan PROCESSING     ingest_document
           │               reschedule              │
           ▼                                       │
    ┌──────────────────┐                           │
    │  ingest_document │◄──────────────────────────┘
    │                  │
    │  phase: parsing  │── status_detail={"phase":"parsing"}
    │  phase: chunking │── status_detail={"phase":"chunking","current":0,"total":150}
    │  phase: embedding│── status_detail={"phase":"embedding","current":45,"total":150}
    │  phase: done     │── status=COMPLETED
    │  phase: failed   │── status=FAILED, status_detail={"error":"..."}
    └──────────────────┘
```

### 5.3 核心组件

#### 5.3.1 TaskRegistry — 任务注册表

```python
# ingestion_service.py, module level
_task_registry: dict[int, asyncio.Task] = {}

def register_task(doc_id: int, task: asyncio.Task):
    _task_registry[doc_id] = task
    task.add_done_callback(lambda t: _task_registry.pop(doc_id, None))

def cancel_task(doc_id: int):
    task = _task_registry.get(doc_id)
    if task and not task.done():
        task.cancel()
```

存储每个文档的 asyncio Task 句柄，支持：
- 查重：同一文档不重复调度
- 取消：用户删除文档时可以取消正在进行的摄入
- 可观测：`len(_task_registry)` 即当前摄入中的文档数

#### 5.3.2 Semaphore 并发控制

```python
_ingestion_semaphore = asyncio.Semaphore(3)  # 最多 3 个文档同时摄入

async def _run_ingestion(doc_id, doc_type, file_path):
    async with _ingestion_semaphore:
        async with AsyncSessionLocal() as session:
            await ingest_document(session, doc_id, doc_type, file_path)
```

3 个槽位足够防止 DB 连接池耗尽。文件在队列中等待，逐个处理。

#### 5.3.3 批量 Embedding

```python
# embedding_service.py 新增
async def embed_batch(texts: list[str]) -> list[list[float]]:
    """批量向量化，一次 HTTP 调用处理所有文本。"""
    provider = settings.EMBEDDING_PROVIDER
    if provider == "openai":
        return await _embed_openai_batch(texts)
    else:
        # Ollama 不支持 batch，退化为并发单条
        tasks = [_embed_ollama(t) for t in texts]
        return await asyncio.gather(*tasks)

async def _embed_openai_batch(texts: list[str]) -> list[list[float]]:
    """POST /v1/embeddings with array input."""
    base = (settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL).rstrip('/')
    url = f"{base}/embeddings" if base.endswith("/v1") else f"{base}/v1/embeddings"
    headers = {"Content-Type": "application/json"}
    api_key = settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {"model": settings.EMBEDDING_MODEL, "input": texts}
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return [item["embedding"] for item in data["data"]]
```

200 chunk 的文档：之前 200 次 HTTP → 之后 1 次 HTTP，速度提升 100x+。

#### 5.3.4 状态机 + Heartbeat

```
                    ┌─────────┐
         schedule → │PENDING  │ (status=1, 刚创建)
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │PARSING │→│CHUNKING│→│EMBEDDING│  (status_detail.phase 更新)
         └────────┘ └────────┘ └────────┘
                                     │
                          ┌──────────┤
                          ▼          ▼
                     ┌────────┐ ┌────────┐
                     │COMPLETED│ │ FAILED │  (status=2/0, 终态)
                     └────────┘ └────────┘
```

每个阶段开始时更新 `status_detail`：
```json
{"phase": "embedding", "current": 45, "total": 200, "started_at": "2026-05-31T16:00:00Z"}
```

#### 5.3.5 失败重试

```python
MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 15]  # 指数退避

async def _run_with_retry(doc_id, doc_type, file_path):
    for attempt, delay in enumerate(RETRY_DELAYS):
        try:
            await _run_ingestion(doc_id, doc_type, file_path)
            return  # 成功
        except asyncio.CancelledError:
            raise  # 不重试取消
        except Exception as exc:
            if attempt == MAX_RETRIES - 1:
                # 最后一次失败 → 标记 FAILED
                async with AsyncSessionLocal() as s:
                    doc = await s.get(KbDocument, doc_id)
                    if doc:
                        doc.status = DOC_STATUS_FAILED
                        doc.status_detail = {"error": str(exc), "retries": MAX_RETRIES}
                        await s.commit()
                return
            await asyncio.sleep(delay)
```

#### 5.3.6 启动恢复

```python
# 在 main.py 的 lifespan 中调用
async def recover_stuck_documents():
    """服务启动时扫描状态为 PROCESSING 的文档，重新调度摄入。"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(KbDocument).where(KbDocument.status == DOC_STATUS_PROCESSING)
        )
        stuck = result.scalars().all()
    for doc in stuck:
        schedule_ingestion(AsyncSessionLocal, doc.id, doc.doc_type, doc.file_path)
        logger.info(f"recovered_stuck_document doc_id={doc.id} name={doc.doc_name}")
```

### 5.4 数据库补充

```sql
-- kb_documents 新增
ALTER TABLE kb_documents ADD COLUMN status_detail JSONB DEFAULT '{}';
-- 例: {"phase": "embedding", "current": 45, "total": 200, "error": "...", "retries": 2}
```

### 5.5 实施计划

每步独立可验证，互不阻塞：

| 阶段 | 内容 | 文件 | 预估 |
|------|------|------|------|
| **Phase 1** | Semaphore 并发控制 (3 槽位) | `ingestion_service.py` | 10 行 |
| **Phase 2** | 批量 embedding `embed_batch()` | `embedding_service.py` + `ingestion_service.py` | 40 行 |
| **Phase 3** | TaskRegistry + 启动恢复 | `ingestion_service.py` + `main.py` | 30 行 |
| **Phase 4** | 状态机 + heartbeat `status_detail` | model migration + `ingestion_service.py` | 30 行 |
| **Phase 5** | 重试机制 | `ingestion_service.py` | 20 行 |
| **Phase 6** | 前端轮询改长轮询（已实现） | `documents.py` + `mindvaultsContext.tsx` | ✅ 完成 |

### 5.6 验证方法

```bash
# 1. 上传一个 PDF，观察日志
# 期望：看到 semaphore 限流、阶段变更日志

# 2. 模拟服务重启
# 上传文档 → 立即 ctrl+C → 重启 → 查看文档状态
# 期望：PROCESSING 文档被 recover_stuck_documents 重新调度

# 3. 批量上传 10 个文件
# 期望：只看到 3 个并发摄入，其余排队，逐个完成

# 4. 检查 chunk_count 一致性
# 期望：chunk_count 等于实际 KbChunk 行数
```
