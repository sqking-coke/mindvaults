import json
from collections.abc import AsyncGenerator
from typing import Optional

from loguru import logger
import httpx

from app.config import settings
from app.core.exceptions import LLMCallFailedError, LLMConfigRequiredError


async def generate_stream(
    system_prompt: str,
    user_prompt: str,
    provider: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """调用 LLM 流式生成，支持动态传入推理参数以实现热更新。"""
    active_provider = provider if provider is not None else settings.LLM_PROVIDER
    
    if active_provider == "openai":
        async for token in _generate_openai(
            system_prompt, user_prompt, base_url, model, api_key, temperature
        ):
            yield token
    else:
        async for token in _generate_ollama(
            system_prompt, user_prompt, base_url, model, temperature
        ):
            yield token


async def _generate_ollama(
    system_prompt: str,
    user_prompt: str,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """Ollama 原生 Chat API (POST /api/chat, NDJSON stream)."""
    active_base_url = base_url if base_url is not None else settings.LLM_BASE_URL
    active_model = model if model is not None else settings.LLM_MODEL
    active_temp = temperature if temperature is not None else 0.3

    url = f"{active_base_url.rstrip('/')}/api/chat"
    payload = {
        "model": active_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": True,
        "options": {"temperature": active_temp},
    }

    try:
        async with httpx.AsyncClient(timeout=120.0, trust_env=False) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except Exception:
                        continue
                    if chunk.get("done"):
                        return
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
    except httpx.HTTPError as exc:
        logger.error(f"llm_call_failed provider=ollama model={model} error=\"{exc}\"")
        raise LLMCallFailedError(f"LLM 调用失败: {exc}")


async def _generate_openai(
    system_prompt: str,
    user_prompt: str,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """OpenAI 兼容 Chat Completions API (POST /chat/completions, SSE stream)."""
    active_base_url = base_url if base_url is not None else settings.LLM_BASE_URL
    active_model = model if model is not None else settings.LLM_MODEL
    active_api_key = api_key if api_key is not None else settings.LLM_API_KEY
    active_temp = temperature if temperature is not None else 0.3

    if not active_api_key:
        raise LLMConfigRequiredError("请先配置大模型 API Key，否则无法进行智能问答")

    base = active_base_url.rstrip('/')
    url = f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"

    headers = {"Content-Type": "application/json"}
    if active_api_key:
        headers["Authorization"] = f"Bearer {active_api_key}"

    payload = {
        "model": active_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": True,
        "temperature": active_temp,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0, trust_env=False) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]  # strip "data: "
                    if data_str == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.HTTPError as exc:
        # 401/403 视为 API Key 无效/未配置
        status = getattr(exc, "response", None) and getattr(exc.response, "status_code", None)
        if status in (401, 403):
            raise LLMConfigRequiredError(f"API Key 无效或未配置，请检查系统设置: {exc}")
        logger.error(f"llm_call_failed provider=openai model={model} error=\"{exc}\"")
        raise LLMCallFailedError(f"LLM 调用失败: {exc}")
