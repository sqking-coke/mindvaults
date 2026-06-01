"""BCE Reranker 精排服务：对向量粗排结果进行交叉编码器重排序。"""
import httpx
from loguru import logger

from app.config import settings


RERANK_MODEL = "BAAI/bge-reranker-v2-m3"


async def rerank(
    question: str,
    chunks: list[dict],  # [{"content": "...", ...}, ...]
    top_k: int = 5,
) -> list[dict]:
    """调用 Reranker API 对候选片段精排，返回 top_k 个最相关的结果。

    chunks 须包含 "content" 字段。返回结果保留原始 metadata 并附加 rerank_score。
    不可用时返回原列表前 top_k 个。
    """
    if not chunks:
        return chunks

    docs = [c["content"] for c in chunks]
    # 优先走 settings 的 Embedding API，因为 Reranker 通常和 Embedding 同一个服务商
    base_url = (settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL).rstrip("/")
    api_key = settings.EMBEDDING_API_KEY or settings.LLM_API_KEY

    # 构造 rerank API URL（硅基流动 / Jina / Cohere 等兼容格式）
    if "siliconflow" in base_url:
        url = f"{base_url}/v1/rerank"
    else:
        # 尝试通用 rerank 端点
        url = f"{base_url}/v1/rerank"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": RERANK_MODEL,
        "query": question,
        "documents": docs,
        "top_n": min(top_k, len(docs)),
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            if not results:
                logger.warning("reranker_returned_empty_results")
                return chunks[:top_k]

            # 按 rerank score 重新排序
            ranked = []
            for r in sorted(results, key=lambda x: x.get("relevance_score", 0), reverse=True):
                idx = r.get("index", 0)
                if 0 <= idx < len(chunks):
                    chunk = dict(chunks[idx])
                    chunk["rerank_score"] = r.get("relevance_score", 0)
                    ranked.append(chunk)
            logger.info(
                f"reranker_completed input={len(chunks)} output={len(ranked)} "
                f"top_score={ranked[0].get('rerank_score', 0):.4f}" if ranked else "no_results"
            )
            return ranked[:top_k]

    except Exception as exc:
        logger.warning(f"reranker_unavailable fallback_to_raw: {exc}")
        return chunks[:top_k]
