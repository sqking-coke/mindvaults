"""
Demo 种子数据：首次启动时预置 3 个示例知识库和文档。
仅在数据为空时执行，走真实摄入管道生成 chunk + embedding。

KB 设计：
  1. mindvaults 产品手册 — 产品介绍、架构、部署
  2. Python 最佳实践指南 — 代码规范、性能优化、并发编程
  3. RESTful API 设计规范 — 接口设计、错误处理、版本管理
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.config import settings
from app.core.database import AsyncSessionLocal
from app.services.ingestion_service import ingest_document

# ============================================================
# 种子文档内容
# ============================================================

SAMPLE_KB = [
    {
        "name": "mindvaults 产品手册",
        "description": "mindvaults RAG 知识库系统产品介绍、架构设计、部署与使用指南",
        "docs": [
            {
                "filename": "01-产品概述.txt",
                "content": (
                    "# mindvaults 产品概述\n\n"
                    "## 什么是 mindvaults\n"
                    "mindvaults 是一款开源、隐私至上的本地 RAG（检索增强生成）知识库问答系统。\n"
                    "它结合了语义检索和大语言模型，让你可以用自然语言对私有文档进行提问。\n"
                    "所有数据存储在本地，不会上传到任何云端服务，你的数据永远归你所有。\n\n"
                    "## 核心特性\n\n"
                    "### 1. RAG 智能问答\n"
                    "基于 pgvector 的 HNSW 向量索引实现毫秒级语义检索，结合 LLM 生成带有引用溯源的答案。\n"
                    "每个答案都标注了来源文档、片段内容和相似度评分，支持点击引用编号查看原文。\n\n"
                    "### 2. 多格式文档支持\n"
                    "支持 PDF、Word (docx)、Markdown、TXT 四种格式的文档上传和自动向量化。\n"
                    "文档上传后自动经过解析 → 切片 → 向量化 → 入库的摄入管道处理。\n\n"
                    "### 3. 双模式部署\n"
                    "- 轻量模式（5 容器）：LLM 和 Embedding 走云端 API（DeepSeek / OpenAI / 硅基流动）\n"
                    "- 全栈模式（6 容器）：加 --profile full 启用 Ollama 本地推理，完全离线运行\n\n"
                    "### 4. 引用溯源\n"
                    "每条 AI 回答包含引用编号，点击可查看对应的原文片段、文档来源、页码和相似度评分。\n"
                    "对于 PDF 文档，支持 pdf.js 双屏联动高亮原文位置。\n\n"
                    "### 5. Obsidian Vault 导入\n"
                    "支持将 Obsidian 笔记库一键导入为知识库，自动提取 YAML frontmatter 属性。\n\n"
                    "## 技术栈\n"
                    "前端：Next.js 14 (App Router) + TypeScript + TailwindCSS\n"
                    "后端：FastAPI + Uvicorn + SQLAlchemy 2.0 + asyncpg\n"
                    "数据库：PostgreSQL 16 + pgvector (HNSW 索引)\n"
                    "缓存：Redis 7（检索缓存 + 推理过程缓存）\n"
                    "LLM：支持 Ollama 本地 / DeepSeek / OpenAI / 通义千问\n"
                    "Embedding：支持 BGE-large-zh-v1.5 / text-embedding-3-small / 本地模型\n"
                    "部署：Docker Compose + Nginx 反向代理\n"
                ),
            },
            {
                "filename": "02-系统架构.txt",
                "content": (
                    "# mindvaults 系统架构\n\n"
                    "## 整体架构\n\n"
                    "用户浏览器 → Nginx (:80) → Frontend (:3000) / Backend (:8000)\n"
                    "                                   │\n"
                    "                    ┌──────────────┼──────────────┐\n"
                    "                    ▼              ▼              ▼\n"
                    "              PostgreSQL       Redis          Ollama\n"
                    "              (pgvector)      (缓存)        (LLM/Embedding)\n\n"
                    "## RAG 检索流水线\n\n"
                    "用户提问 → 意图识别（分类/闲聊/知识问答）→ HNSW 向量粗排（Top-50）\n"
                    "→ BCE Reranker 精排（Top-5）→ LLM 生成 → 答案带引用溯源\n\n"
                    "## 意图识别\n"
                    "系统自动对用户问题进行分类：\n"
                    "- 知识问答：走完整 RAG 流程，检索文档后生成答案\n"
                    "- 文档检索：直接返回相关片段，不做生成\n"
                    "- 闲聊：直接由 LLM 回复，不检索知识库\n\n"
                    "## 向量检索\n"
                    "使用 pgvector 的 HNSW 索引实现高效向量相似度搜索。\n"
                    "pgvector 是 PostgreSQL 的向量扩展，支持创建 HNSW 索引以加速近似最近邻搜索。\n"
                    "默认使用余弦相似度（cosine similarity）作为距离度量。\n\n"
                    "CREATE INDEX ON kb_chunks USING hnsw (embedding vector_cosine_ops)\n\n"
                    "## 数据隔离\n"
                    "多知识库通过 kb_id 实现数据隔离：\n"
                    "- 每个知识库拥有独立的文档集合\n"
                    "- 切片（chunk）通过 kb_id 归属到具体知识库\n"
                    "- 会话（session）绑定 kb_id，检索时自动限定范围\n"
                    "- 配置（kb_config）以 kb_id 作为主键，每 KB 独立 RAG 参数\n\n"
                    "## 缓存策略\n"
                    "- 检索结果缓存：Redis 缓存高频查询的检索结果，TTL 1 小时\n"
                    "- 推理过程缓存：SSE 流式推理步骤存入 Redis，支持断线重连恢复\n"
                    "- 缓存降级：Redis 不可用时自动回退到数据库直查\n\n"
                    "## 部署架构\n"
                    "Nginx 作为反向代理，路由规则：\n"
                    "- / → 前端 Next.js（端口 3000）\n"
                    "- /api/* → 后端 FastAPI（端口 8000）\n"
                    "SSE 流式连接通过 Nginx 时需关闭缓冲：proxy_buffering off;\n"
                ),
            },
            {
                "filename": "03-部署指南.txt",
                "content": (
                    "# mindvaults 部署指南\n\n"
                    "## 环境要求\n"
                    "- Docker 24+ 和 Docker Compose v2\n"
                    "- 至少 4GB 可用内存（轻量模式）或 8GB（全栈 Ollama 模式）\n"
                    "- 至少 10GB 可用磁盘空间\n\n"
                    "## 快速部署（Docker Compose）\n\n"
                    "### 轻量模式（推荐，5 容器）\n"
                    "使用云端 API 进行 LLM 推理和 Embedding：\n"
                    "docker compose --env-file .env.demo up -d\n\n"
                    "容器列表：\n"
                    "- mindvaults-nginx：反向代理\n"
                    "- mindvaults-frontend：Next.js 前端\n"
                    "- mindvaults-backend：FastAPI 后端\n"
                    "- mindvaults-db：PostgreSQL + pgvector\n"
                    "- mindvaults-redis：Redis 缓存\n\n"
                    "### 全栈模式（完全离线，6 容器）\n"
                    "增加 Ollama 容器用于本地推理：\n"
                    "docker compose --profile full --env-file .env.demo up -d\n\n"
                    "## 环境变量配置\n\n"
                    "核心配置项：\n"
                    "- LLM_PROVIDER: openai 或 ollama\n"
                    "- LLM_BASE_URL: API 端点地址\n"
                    "- LLM_API_KEY: API 密钥\n"
                    "- EMBEDDING_PROVIDER: openai 或 ollama\n"
                    "- EMBEDDING_BASE_URL: Embedding API 端点\n"
                    "- EMBEDDING_API_KEY: Embedding API 密钥\n\n"
                    "## 安全建议\n"
                    "- 生产环境修改 API_KEY 和 CORS_ORIGINS\n"
                    "- 配置 Nginx HTTPS 证书\n"
                    "- 限制上传文件大小（MAX_UPLOAD_SIZE_MB）\n"
                    "- 启用限流（CHAT_RATE_LIMIT / UPLOAD_RATE_LIMIT）\n"
                    "- DEMO_MODE 仅用于演示，生产环境必须设为 false\n\n"
                    "## 数据备份\n"
                    "PostgreSQL 数据卷：mindvaults_pgdata\n"
                    "Redis 数据卷：mindvaults_redisdata\n"
                    "上传文件目录：mindvaults_uploads\n\n"
                    "备份命令：docker exec mindvaults-db pg_dump -U mindvaults mindvaults > backup.sql\n"
                ),
            },
        ],
    },
    {
        "name": "Python 最佳实践指南",
        "description": "Python 编程规范、性能优化、异步编程和常见设计模式指南",
        "docs": [
            {
                "filename": "01-代码规范.txt",
                "content": (
                    "# Python 代码规范与最佳实践\n\n"
                    "## PEP 8 基础规范\n\n"
                    "PEP 8 是 Python 官方代码风格指南，以下是核心要点：\n\n"
                    "### 命名约定\n"
                    "- 模块名：小写 + 下划线（my_module.py）\n"
                    "- 类名：驼峰命名（MyClass）\n"
                    "- 函数和变量：小写 + 下划线（my_function, my_variable）\n"
                    "- 常量：全大写 + 下划线（MAX_SIZE = 100）\n"
                    "- 私有成员：单下划线前缀（_internal_method）\n\n"
                    "### 缩进和空格\n"
                    "- 使用 4 个空格缩进，不要用 Tab\n"
                    "- 每行不超过 79 个字符（文档字符串不超过 72）\n"
                    "- 函数和类之间空两行，方法之间空一行\n\n"
                    "### Import 规范\n"
                    "- 标准库 → 第三方库 → 本地模块，每组之间空一行\n"
                    "- 避免使用 from module import *\n"
                    "- 使用绝对导入而非相对导入\n\n"
                    "## Type Hints（类型标注）\n\n"
                    "Python 3.5+ 支持类型标注，提高代码可读性和 IDE 支持：\n\n"
                    "def process_batch(texts: list[str], chunk_size: int = 500) -> list[str]:\n"
                    "    return [t[:chunk_size] for t in texts]\n\n"
                    "## 异常处理\n\n"
                    "- 捕获具体异常，不要裸用 except:\n"
                    "- 使用自定义异常类表达业务含义\n"
                    "- finally 块确保资源释放\n"
                    "- 不要在 except 中静默吞掉异常\n\n"
                    "## 文档字符串（Docstring）\n\n"
                    "使用三重双引号，第一行为简短描述，空行后补充详细说明：\n\n"
                    "def chunk_text(text: str, size: int = 500) -> list[str]:\n"
                    '    """将长文本按指定大小切分为多个片段。\n\n'
                    "    Args:\n"
                    "        text: 待切分的原始文本。\n"
                    "        size: 每个片段的目标字符数，默认 500。\n\n"
                    "    Returns:\n"
                    "        切分后的文本片段列表。\n"
                    '    """\n'
                ),
            },
            {
                "filename": "02-异步编程.txt",
                "content": (
                    "# Python 异步编程指南\n\n"
                    "## async/await 基础\n\n"
                    "Python 3.5+ 引入 async/await 语法进行协程编程。异步编程的核心思想是：在等待 I/O 操作\n"
                    "（如网络请求、数据库查询、文件读写）时不阻塞主线程，让出 CPU 给其他任务。\n\n"
                    "async def fetch_data(url: str) -> dict:\n"
                    "    async with httpx.AsyncClient() as client:\n"
                    "        resp = await client.get(url)\n"
                    "        return resp.json()\n\n"
                    "## 并发 vs 并行\n\n"
                    "- 并发（Concurrency）：多个任务交替执行，适合 I/O 密集场景。使用 asyncio。\n"
                    "- 并行（Parallelism）：多个任务同时执行，适合 CPU 密集场景。使用 multiprocessing。\n\n"
                    "Python 的 GIL（全局解释器锁）限制了多线程的并行能力，但 asyncio 不受 GIL 影响，\n"
                    "因为它是单线程内的协程调度。\n\n"
                    "## asyncio.gather 并发执行\n\n"
                    "tasks = [fetch_url(url) for url in urls]\n"
                    "results = await asyncio.gather(*tasks, return_exceptions=True)\n"
                    "# return_exceptions=True 防止一个任务失败导致全部取消\n\n"
                    "## 常见陷阱\n\n"
                    "1. 不要在协程中调用 time.sleep()，应使用 await asyncio.sleep()\n"
                    "2. 不要在协程中执行 CPU 密集计算，应使用 loop.run_in_executor()\n"
                    "3. 确保使用支持异步的库（httpx 而非 requests, asyncpg 而非 psycopg2）\n"
                    "4. asyncio.create_task() 创建的 task 如果未被 await，异常会被静默吞掉\n\n"
                    "## 数据库异步操作\n\n"
                    "SQLAlchemy 2.0 提供了完整的异步支持：\n\n"
                    "from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker\n\n"
                    "engine = create_async_engine('postgresql+asyncpg://user:pass@localhost/db')\n"
                    "AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)\n\n"
                    "async with AsyncSessionLocal() as db:\n"
                    "    result = await db.execute(select(MyModel).where(MyModel.id == 1))\n"
                    "    item = result.scalar_one_or_none()\n\n"
                    "## 事务管理\n"
                    "异步事务必须在同一个协程中完成，commit 或 rollback 必须显式调用：\n"
                    "所有 db.add() + db.flush() 后，所有代码路径（含 early return、异常分支）\n"
                    "都必须显式调用 commit() 或 rollback()。循环内 flush() 失败后必须 rollback()。\n"
                ),
            },
        ],
    },
    {
        "name": "RESTful API 设计规范",
        "description": "REST API 接口设计原则、统一错误处理、版本管理和安全鉴权规范",
        "docs": [
            {
                "filename": "01-接口设计原则.txt",
                "content": (
                    "# RESTful API 接口设计原则\n\n"
                    "## URL 设计规范\n\n"
                    "- 使用名词复数表示资源集合：GET /api/v1/users\n"
                    "- 使用路径参数表示具体资源：GET /api/v1/users/{id}\n"
                    "- 使用嵌套表示从属关系：GET /api/v1/users/{id}/orders\n"
                    "- 避免在 URL 中使用动词：POST /api/v1/users 而非 POST /api/v1/createUser\n\n"
                    "## HTTP 方法语义\n\n"
                    "- GET：查询资源（幂等）\n"
                    "- POST：创建资源（非幂等）\n"
                    "- PUT：全量更新资源（幂等）\n"
                    "- PATCH：部分更新资源\n"
                    "- DELETE：删除资源（幂等）\n\n"
                    "## 统一响应格式\n\n"
                    '成功响应：{"code": 0, "data": {...}}\n'
                    '错误响应：{"code": 1001, "message": "参数校验失败"}\n'
                    "code=0 表示成功，非 0 表示失败。前端根据 code 而非 HTTP 状态码判断业务结果。\n\n"
                    "## 分页规范\n\n"
                    "请求参数：GET /api/v1/kb/documents?page=1&page_size=20&kb_id=1\n"
                    '响应格式：{"code": 0, "data": {"items": [...], "total": 150}}\n\n'
                    "## 错误码设计\n\n"
                    "按模块划分错误码范围：\n"
                    "- 1xxx：请求参数错误\n"
                    "- 2xxx：文档相关错误\n"
                    "- 3xxx：会话相关错误\n"
                    "- 4xxx：检索相关错误\n"
                    "- 5xxx：模型/服务相关错误\n"
                    "- 9xxx：系统内部错误\n\n"
                    "## 鉴权\n\n"
                    "使用 API Key 鉴权：Authorization: Bearer <API_KEY>\n"
                    "健康检查接口不鉴权：GET /api/v1/health\n"
                    "可通过 DEPs 依赖注入统一处理鉴权逻辑。\n\n"
                    "## 请求体规范\n\n"
                    "- Content-Type: application/json\n"
                    "- 字段使用 snake_case 命名\n"
                    "- 必填字段在 Schema 中用 Field(...) 标记\n"
                    "- 可选字段设 default 值或 Field(None)\n"
                ),
            },
            {
                "filename": "02-安全与限流.txt",
                "content": (
                    "# API 安全与限流设计\n\n"
                    "## 认证与授权\n\n"
                    "### API Key 鉴权\n"
                    "所有 API 端点（除健康检查）都通过 Authorization 头进行鉴权：\n"
                    "Authorization: Bearer <API_KEY>\n\n"
                    "后端验证流程：\n"
                    "1. 从请求头提取 Authorization\n"
                    "2. 解析 Bearer token\n"
                    "3. 与环境变量 API_KEY 比对\n"
                    "4. 不匹配返回 401 Unauthorized\n\n"
                    "## 限流（Rate Limiting）\n\n"
                    "使用 slowapi + Redis 实现接口限流：\n"
                    "- 问答接口：30 次/分钟（生产），10 次/分钟（演示）\n"
                    "- 上传接口：10 次/分钟（生产），5 次/分钟（演示）\n\n"
                    "限流响应示例：\n"
                    'HTTP 429 {"code": 9002, "message": "请求过于频繁，请稍后重试"}\n\n'
                    "## 上传安全\n\n"
                    "- 白名单控制文件类型：MIN_UPLOAD_SIZE_MB 和 ALLOWED_EXTENSIONS\n"
                    "- 文件大小限制：MAX_UPLOAD_SIZE_MB（生产 50MB，演示 5MB）\n"
                    "- 单次上传数量限制：MAX_FILES_PER_UPLOAD\n"
                    "- 上传前校验 MIME 类型与扩展名一致性\n\n"
                    "## IP 黑名单（演示模式）\n\n"
                    "在 DEMO_MODE=true 时，自动启用 IP 高频访问黑名单中间件：\n"
                    "- 60 秒窗口内超过 300 次请求自动封禁 10 分钟\n"
                    "- 健康检查接口不计入统计\n"
                    "- Redis 不可用时自动降级放行\n"
                    "- 支持 X-Forwarded-For 头（Nginx 代理场景）\n\n"
                    "## 数据脱敏\n\n"
                    "日志输出自动脱敏敏感字段：\n"
                    "- api_key → sk-••••2825\n"
                    "- password、token、secret → 自动识别并脱敏\n"
                    "- 请求体日志中递归脱敏 JSON 字段\n\n"
                    "## CORS 配置\n\n"
                    "CORS_ORIGINS 控制允许访问的域名，演示环境应严格限制：\n"
                    "CORS_ORIGINS=https://demo.mindvaults.app,http://localhost:3000\n"
                ),
            },
        ],
    },
]


# ============================================================
# 种子逻辑
# ============================================================


async def seed():
    async with AsyncSessionLocal() as db:
        # 每次发布清空旧数据重新写入
        print("[seed] Demo 模式：清除旧数据...")
        await db.execute(text("DELETE FROM kb_qa_records"))
        await db.execute(text("DELETE FROM kb_sessions"))
        await db.execute(text("DELETE FROM kb_chunks"))
        await db.execute(text("DELETE FROM kb_documents"))
        await db.execute(text("DELETE FROM kb_knowledge_bases"))
        await db.execute(text("DELETE FROM kb_config"))
        await db.commit()
        print("[seed] 旧数据已清除，开始写入示例数据...")
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        doc_count = 0

        for kb_data in SAMPLE_KB:
            # 创建知识库
            result = await db.execute(
                text(
                    "INSERT INTO kb_knowledge_bases (name, description) "
                    "VALUES (:name, :desc) RETURNING id"
                ),
                {"name": kb_data["name"], "desc": kb_data["description"]},
            )
            kb_id = result.scalar()
            await db.commit()
            print(f"[seed]   创建知识库: {kb_data['name']} (id={kb_id})")

            for doc_data in kb_data["docs"]:
                # 写入持久化上传目录（和行为与用户上传一致）
                stored_name = f"seed_{uuid.uuid4().hex}.txt"
                dest_path = upload_dir / stored_name
                with open(dest_path, "w", encoding="utf-8") as f:
                    f.write(doc_data["content"])

                content_bytes = doc_data["content"].encode("utf-8")
                file_size = len(content_bytes)

                # 创建文档记录
                result = await db.execute(
                    text(
                        "INSERT INTO kb_documents (kb_id, doc_name, doc_type, file_path, file_size, "
                        "status, status_detail, chunk_count) "
                        "VALUES (:kb_id, :name, 'txt', :path, :size, 1, '{}', 0) RETURNING id"
                    ),
                    {
                        "kb_id": kb_id,
                        "name": doc_data["filename"],
                        "path": str(dest_path),
                        "size": file_size,
                    },
                )
                doc_id = result.scalar()
                await db.commit()

                # 走真实摄入管道：解析 → 切片 → 向量化 → 入库
                print(f"[seed]     摄入文档: {doc_data['filename']} (id={doc_id})")
                try:
                    await ingest_document(db, doc_id, "txt", str(dest_path))
                    doc_count += 1
                except Exception as exc:
                    print(f"[seed]     警告：文档摄入失败 (doc_id={doc_id}): {exc}")
                    await db.execute(
                        text(
                            "UPDATE kb_documents SET status=0, status_detail=:detail "
                            "WHERE id=:id"
                        ),
                        {"id": doc_id, "detail": str(exc)[:500]},
                    )
                    await db.commit()

        print(f"[seed] 示例数据写入完成：{len(SAMPLE_KB)} 个知识库，{doc_count} 篇文档")


if __name__ == "__main__":
    asyncio.run(seed())
