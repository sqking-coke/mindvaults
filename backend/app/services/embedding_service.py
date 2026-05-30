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
