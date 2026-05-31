import asyncio

from loguru import logger

import httpx

from app.config import settings
from app.core.exceptions import EmbeddingUnavailableError


async def embed_text(text: str) -> list[float]:
    """生成文本向量，兼容 Ollama 原生 & OpenAI 兼容 API."""
    provider = settings.EMBEDDING_PROVIDER
    if provider == "openai":
        return await _embed_openai(text)
    else:
        return await _embed_ollama(text)


_BATCH_CHUNK_SIZE = 20  # 单次 embedding 请求最大文本数，避免 413 Payload Too Large

async def embed_batch(texts: list[str]) -> list[list[float]]:
    """批量生成文本向量。OpenAI 兼容 API 使用 array input；
    Ollama 不支持批量，退化为并发单条调用。
    单次请求超过 _BATCH_CHUNK_SIZE 条时自动拆分为多次请求。"""
    if not texts:
        return []
    provider = settings.EMBEDDING_PROVIDER
    if provider == "openai":
        all_embeddings = []
        for i in range(0, len(texts), _BATCH_CHUNK_SIZE):
            batch = texts[i:i + _BATCH_CHUNK_SIZE]
            all_embeddings.extend(await _embed_openai_batch(batch))
        return all_embeddings
    else:
        # Ollama 退化为并发单条
        tasks = [_embed_ollama(t) for t in texts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        out = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"embed_batch_ollama_failed index={i} error=\"{r}\"")
                raise EmbeddingUnavailableError(f"Embedding batch 调用失败: index={i} {r}")
            out.append(r)
        return out


async def _embed_ollama(text: str) -> list[float]:
    """Ollama 原生 Embedding API (POST /api/embeddings)."""
    base = settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL
    url = f"{base.rstrip('/')}/api/embeddings"
    payload = {"model": settings.EMBEDDING_MODEL, "prompt": text}

    try:
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            embedding: list[float] = data.get("embedding", [])
            if not embedding:
                raise EmbeddingUnavailableError("Embedding 模型返回空向量")
            return embedding
    except httpx.HTTPError as exc:
        logger.error(f"Embedding (ollama) 调用失败: {exc}")
        raise EmbeddingUnavailableError(f"Embedding 模型不可用: {exc}")


async def _embed_openai(text: str) -> list[float]:
    """OpenAI 兼容 Embedding API (POST /embeddings).

    支持 OpenAI / DeepSeek / 通义千问 / 本地 vLLM 等兼容接口。
    """
    base = (settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL).rstrip('/')
    url = f"{base}/embeddings" if base.endswith("/v1") else f"{base}/v1/embeddings"

    headers = {"Content-Type": "application/json"}
    api_key = settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": settings.EMBEDDING_MODEL,
        "input": text,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            embedding: list[float] = data.get("data", [{}])[0].get("embedding", [])
            if not embedding:
                raise EmbeddingUnavailableError("Embedding 模型返回空向量")
            return embedding
    except (httpx.HTTPError, KeyError, IndexError) as exc:
        logger.error(f"Embedding (openai) 调用失败: {exc}")
        raise EmbeddingUnavailableError(f"Embedding 模型不可用: {exc}")


async def _embed_openai_batch(texts: list[str]) -> list[list[float]]:
    """OpenAI 兼容批量 Embedding (POST /v1/embeddings with array input)."""
    base = (settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL).rstrip('/')
    url = f"{base}/embeddings" if base.endswith("/v1") else f"{base}/v1/embeddings"

    headers = {"Content-Type": "application/json"}
    api_key = settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {"model": settings.EMBEDDING_MODEL, "input": texts}

    try:
        async with httpx.AsyncClient(timeout=120.0, trust_env=False) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            embeddings = [item["embedding"] for item in data.get("data", [])]
            if len(embeddings) != len(texts):
                raise EmbeddingUnavailableError(
                    f"Batch embedding 返回数量不匹配: expected={len(texts)} got={len(embeddings)}"
                )
            return embeddings
    except (httpx.HTTPError, KeyError, IndexError) as exc:
        logger.error(f"Embedding (openai) batch 调用失败: {exc}")
        raise EmbeddingUnavailableError(f"Embedding batch 不可用: {exc}")
