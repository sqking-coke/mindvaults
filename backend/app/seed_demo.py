"""
Demo 种子数据：首次启动时预置示例知识库和文档。
仅在 DEMO_MODE=true 且数据库中无数据时执行。
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.core.database import AsyncSessionLocal


SAMPLE_DOCS = [
    {
        "kb_name": "mindvaults 产品手册",
        "kb_desc": "mindvaults 产品介绍、功能概览和使用指南",
        "docs": [
            {
                "filename": "welcome.txt",
                "content": (
                    "欢迎使用 mindvaults！\n\n"
                    "mindvaults 是一款开源、隐私至上的本地 RAG 知识库问答系统。\n"
                    "它支持本地 Ollama 推理和云端 API 双模式，你的数据永远归你所有。\n\n"
                    "核心特性：\n"
                    "1. RAG 智能问答 — 基于 pgvector 的语义检索 + LLM 生成，答案带引用溯源\n"
                    "2. 多格式文档 — 支持 PDF、Word、Markdown、TXT 文件上传和自动向量化\n"
                    "3. 双模式部署 — 轻量 5 容器（云端 API）或全栈 6 容器（Ollama 本地）\n"
                    "4. 引用溯源 — 每个答案标注来源文档、页码和相似度评分\n"
                    "5. Obsidian Vault 导入 — 将你的笔记一键转为知识库\n\n"
                    "快速开始：\n"
                    "1. 在「知识中心」创建知识库并上传文档\n"
                    "2. 在「对话沙盒」中提问，系统自动检索相关文档并生成回答\n"
                    "3. 点击答案中的引用编号查看原文出处\n\n"
                    "如需自部署，请访问 https://github.com/sqking-coke/mindvaults"
                ),
            },
            {
                "filename": "architecture.txt",
                "content": (
                    "mindvaults 系统架构\n\n"
                    "用户浏览器 → Nginx (:80) → Frontend (:3000) / Backend (:8000)\n"
                    "                                   │\n"
                    "                    ┌──────────────┼──────────────┐\n"
                    "                    ▼              ▼              ▼\n"
                    "              PostgreSQL       Redis          Ollama\n"
                    "              (pgvector)      (缓存)        (LLM/Embedding)\n\n"
                    "RAG 检索流水线：\n"
                    "用户提问 → 意图识别 → HNSW 向量粗排（Top-50）→ BCE Reranker 精排（Top-5）→ LLM 生成\n\n"
                    "部署模式：\n"
                    "- 默认：5 容器，LLM 走 DeepSeek/OpenAI API\n"
                    "- 全栈：加 --profile full，Ollama 本地推理\n\n"
                    "技术栈：Next.js 14 + FastAPI + PostgreSQL/pgvector + Redis + Docker"
                ),
            },
        ],
    },
    {
        "kb_name": "示例：API 文档",
        "kb_desc": "RESTful API 接口规范和鉴权说明",
        "docs": [
            {
                "filename": "api_guide.txt",
                "content": (
                    "mindvaults API 参考\n\n"
                    "所有接口以 /api/v1 为前缀，需 Authorization: Bearer <API_KEY> 鉴权。\n\n"
                    "文档管理：\n"
                    "- POST /api/v1/kb/documents — 上传文档\n"
                    "- GET /api/v1/kb/documents — 文档列表\n"
                    "- DELETE /api/v1/kb/documents/{id} — 删除文档\n\n"
                    "智能问答：\n"
                    "- POST /api/v1/kb/chat — SSE 流式问答\n"
                    "- GET /api/v1/kb/chat/sessions — 会话列表\n\n"
                    "检索测试：\n"
                    "- POST /api/v1/kb/retrieval/test — 检索沙盒\n\n"
                    "限流规则：\n"
                    "- 问答 30次/分钟，上传 10次/分钟"
                ),
            }
        ],
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # 检查是否已有数据
        result = await db.execute(text("SELECT COUNT(*) FROM kb_knowledge_bases"))
        count = result.scalar()
        if count > 0:
            print("[seed] 数据库已有数据，跳过种子写入")
            return

        print("[seed] Demo 模式：写入示例数据...")

        for kb_data in SAMPLE_DOCS:
            # 创建知识库
            await db.execute(
                text(
                    "INSERT INTO kb_knowledge_bases (name, description) VALUES (:name, :desc)"
                ),
                {"name": kb_data["kb_name"], "desc": kb_data["kb_desc"]},
            )
            result = await db.execute(text("SELECT currval(pg_get_serial_sequence('kb_knowledge_bases', 'id'))"))
            kb_id = result.scalar()

            for doc_data in kb_data["docs"]:
                # 插入文档元数据（不上传实际文件，仅作展示）
                await db.execute(
                    text(
                        "INSERT INTO kb_documents (kb_id, filename, file_size, status, char_count, chunk_count) "
                        "VALUES (:kb_id, :filename, :size, 'success', :chars, 0)"
                    ),
                    {
                        "kb_id": kb_id,
                        "filename": doc_data["filename"],
                        "size": len(doc_data["content"].encode("utf-8")),
                        "chars": len(doc_data["content"]),
                    },
                )

        await db.commit()
        print("[seed] 示例数据写入完成")


if __name__ == "__main__":
    asyncio.run(seed())
