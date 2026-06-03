import asyncio
from dataclasses import dataclass

from loguru import logger

import httpx

from app.config import settings
from app.core.exceptions import EmbeddingUnavailableError, LLMConfigRequiredError


@dataclass
class EmbeddingConfig:
    """解析后的 Embedding 配置（从 system_config + env 合并）。"""
    api_key: str | None
    base_url: str
    provider: str  # "ollama" | "openai"
    model: str


async def resolve_embedding_config(
    sys_cfg,  # SystemConfig | None
    api_key_override: str | None = None,
) -> EmbeddingConfig:
    """从 SystemConfig + 环境变量解析 Embedding 配置。

    优先使用 sys_cfg（DB 动态配置），NULL 字段回退到环境变量。
    这是 chat_service 和 ingestion_service 的单一真相来源。
    """
    # provider
    emb_provider = sys_cfg.embedding_provider if sys_cfg and sys_cfg.embedding_provider else "same_as_llm"
    sys_llm_key = sys_cfg.llm_api_key if sys_cfg else None
    sys_llm_url = sys_cfg.llm_base_url if sys_cfg else None
    sys_emb_key = sys_cfg.embedding_api_key if sys_cfg else None
    sys_emb_url = sys_cfg.embedding_base_url if sys_cfg else None
    sys_llm_model = sys_cfg.llm_model if sys_cfg else None

    if emb_provider == "same_as_llm":
        api_key = api_key_override or settings.EMBEDDING_API_KEY or sys_llm_key
        base_url = settings.EMBEDDING_BASE_URL or sys_llm_url or settings.LLM_BASE_URL or "http://localhost:11434"
        provider_for_call = "openai"
    elif emb_provider == "ollama":
        api_key = None
        base_url = sys_emb_url or settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL or "http://localhost:11434"
        provider_for_call = "ollama"
    else:
        # openai / siliconflow / deepseek 等均走 OpenAI 兼容 API
        api_key = api_key_override or sys_emb_key or settings.EMBEDDING_API_KEY
        base_url = sys_emb_url or settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL or "http://localhost:11434"
        provider_for_call = "openai"

    model = settings.EMBEDDING_MODEL

    return EmbeddingConfig(
        api_key=api_key,
        base_url=base_url,
        provider=provider_for_call,
        model=model,
    )


async def embed_text(
    text: str,
    api_key: str | None = None,
    base_url: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> list[float]:
    """生成文本向量，兼容 Ollama 原生 & OpenAI 兼容 API.

    可选传入 api_key/base_url/provider/model 覆盖 settings 默认值（用于 DB 动态配置）。
    """
    active_provider = provider if provider is not None else settings.EMBEDDING_PROVIDER
    if active_provider == "openai":
        return await _embed_openai(text, api_key=api_key, base_url=base_url, model=model)
    else:
        return await _embed_ollama(text, base_url=base_url)


_BATCH_CHUNK_SIZE = 20  # 单次 embedding 请求最大文本数，避免 413 Payload Too Large

async def embed_batch(
    texts: list[str],
    api_key: str | None = None,
    base_url: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> list[list[float]]:
    """批量生成文本向量。OpenAI 兼容 API 使用 array input；
    Ollama 不支持批量，退化为并发单条调用。
    单次请求超过 _BATCH_CHUNK_SIZE 条时自动拆分为多次请求。

    可选传入 api_key/base_url/provider/model 覆盖 settings 默认值。
    """
    if not texts:
        return []
    active_model = model or settings.EMBEDDING_MODEL
    active_provider = provider if provider is not None else settings.EMBEDDING_PROVIDER
    if active_provider == "openai":
        all_embeddings = []
        for i in range(0, len(texts), _BATCH_CHUNK_SIZE):
            batch = texts[i:i + _BATCH_CHUNK_SIZE]
            all_embeddings.extend(await _embed_openai_batch(
                batch, api_key=api_key, base_url=base_url, model=active_model,
            ))
        return all_embeddings
    else:
        # Ollama 退化为并发单条
        tasks = [_embed_ollama(t, base_url=base_url) for t in texts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        out = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"embed_batch_ollama_failed index={i} error=\"{r}\"")
                raise EmbeddingUnavailableError(f"Embedding batch 调用失败: index={i} {r}")
            out.append(r)
        return out


async def _embed_ollama(text: str, base_url: str | None = None) -> list[float]:
    """Ollama 原生 Embedding API (POST /api/embeddings)."""
    base = base_url or settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL
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


async def _embed_openai(text: str, api_key: str | None = None, base_url: str | None = None, model: str | None = None) -> list[float]:
    """OpenAI 兼容 Embedding API (POST /embeddings).

    支持 OpenAI / DeepSeek / 通义千问 / 本地 vLLM 等兼容接口。
    """
    active_base = base_url or settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL
    base = active_base.rstrip('/')
    url = f"{base}/embeddings" if base.endswith("/v1") else f"{base}/v1/embeddings"

    active_api_key = api_key or settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if not active_api_key:
        raise LLMConfigRequiredError("请先配置 Embedding API Key，否则无法进行文档向量化")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {active_api_key}"}

    payload = {
        "model": model or settings.EMBEDDING_MODEL,
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
        status = getattr(exc, "response", None) and getattr(exc.response, "status_code", None)
        if status in (401, 403):
            raise LLMConfigRequiredError(f"Embedding API Key 无效或未配置，请检查系统设置: {exc}")
        logger.error(f"Embedding (openai) 调用失败: {exc}")
        raise EmbeddingUnavailableError(f"Embedding 模型不可用: {exc}")


async def _embed_openai_batch(texts: list[str], api_key: str | None = None, base_url: str | None = None, model: str | None = None) -> list[list[float]]:
    """OpenAI 兼容批量 Embedding (POST /v1/embeddings with array input)."""
    active_base = base_url or settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL
    base = active_base.rstrip('/')
    url = f"{base}/embeddings" if base.endswith("/v1") else f"{base}/v1/embeddings"

    active_api_key = api_key or settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if not active_api_key:
        raise LLMConfigRequiredError("请先配置 Embedding API Key，否则无法进行文档向量化")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {active_api_key}"}

    payload = {"model": model or settings.EMBEDDING_MODEL, "input": texts}

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
        status = getattr(exc, "response", None) and getattr(exc.response, "status_code", None)
        if status in (401, 403):
            raise LLMConfigRequiredError(f"Embedding API Key 无效或未配置，请检查系统设置: {exc}")
        logger.error(f"Embedding (openai) batch 调用失败: {exc}")
        raise EmbeddingUnavailableError(f"Embedding batch 不可用: {exc}")
