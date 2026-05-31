import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.config import settings
from app.api.deps import get_db
from app.services.retrieval_service import get_config
from app.schemas.config import SystemConfigResponse, SystemConfigRequest
from app.schemas.common import success_response, error_response

router = APIRouter()


def _mask_api_key(key: str) -> str:
    """对 API Key 进行脱敏处理。"""
    if not key:
        return ""
    if len(key) <= 8:
        return "••••••••"
    return f"{key[:4]}••••••••{key[-4:]}"


@router.get("/config", response_model=dict)
async def get_system_config(db: AsyncSession = Depends(get_db)):
    """获取当前系统运行参数和 LLM 推理引擎配置。"""
    cfg = await get_config(db)
    
    # 填充缺省值（如果数据库里是 None，自动回退到 settings/环境变量 的全局默认配置）
    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER
    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    model = cfg.llm_model if cfg.llm_model is not None else settings.LLM_MODEL
    
    # 对 API Key 进行安全脱敏
    raw_key = cfg.llm_api_key if cfg.llm_api_key is not None else settings.LLM_API_KEY
    masked_key = _mask_api_key(raw_key)

    system_prompt = cfg.system_prompt if cfg.system_prompt is not None else "你是一个基于本地知识库的智能问答助手。请严格根据以下提供的参考文档内容回答用户问题。如果参考文档中没有相关信息，请明确告知用户，不要编造内容。回答时引用具体的文档名称。"

    data = {
        "chunk_size": cfg.chunk_size,
        "chunk_overlap": cfg.chunk_overlap,
        "top_k": cfg.top_k,
        "similarity_threshold": cfg.similarity_threshold,
        "embedding_dim": cfg.embedding_dim,
        "llm_provider": provider,
        "llm_base_url": base_url,
        "llm_model": model,
        "llm_api_key": masked_key,
        "llm_temperature": cfg.llm_temperature,
        "system_prompt": system_prompt,
    }
    return success_response(data)


@router.put("/config", response_model=dict)
async def update_system_config(payload: SystemConfigRequest, db: AsyncSession = Depends(get_db)):
    """更新 RAG 参数或大模型推理引擎参数。"""
    cfg = await get_config(db)

    # 1. 更新 RAG 参数
    if payload.chunk_size is not None:
        cfg.chunk_size = payload.chunk_size
    if payload.chunk_overlap is not None:
        cfg.chunk_overlap = payload.chunk_overlap
    if payload.top_k is not None:
        cfg.top_k = payload.top_k
    if payload.similarity_threshold is not None:
        cfg.similarity_threshold = payload.similarity_threshold

    # 2. 更新 LLM 参数
    if payload.llm_provider is not None:
        cfg.llm_provider = payload.llm_provider.strip().lower()
    if payload.llm_base_url is not None:
        cfg.llm_base_url = payload.llm_base_url.strip()
    if payload.llm_model is not None:
        cfg.llm_model = payload.llm_model.strip()
    
    # 3. 密钥处理：如果传来的是打码的版本，忽略；如果是新密钥则覆盖存储
    if payload.llm_api_key is not None:
        k = payload.llm_api_key.strip()
        if k and "••" not in k:
            cfg.llm_api_key = k
        elif not k:
            cfg.llm_api_key = ""  # 显式清空 Key

    if payload.llm_temperature is not None:
        cfg.llm_temperature = payload.llm_temperature
    if payload.system_prompt is not None:
        cfg.system_prompt = payload.system_prompt.strip()

    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)

    # 构造最新响应
    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER
    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    model = cfg.llm_model if cfg.llm_model is not None else settings.LLM_MODEL
    masked_key = _mask_api_key(cfg.llm_api_key if cfg.llm_api_key is not None else settings.LLM_API_KEY)
    system_prompt = cfg.system_prompt if cfg.system_prompt is not None else ""

    data = {
        "chunk_size": cfg.chunk_size,
        "chunk_overlap": cfg.chunk_overlap,
        "top_k": cfg.top_k,
        "similarity_threshold": cfg.similarity_threshold,
        "embedding_dim": cfg.embedding_dim,
        "llm_provider": provider,
        "llm_base_url": base_url,
        "llm_model": model,
        "llm_api_key": masked_key,
        "llm_temperature": cfg.llm_temperature,
        "system_prompt": system_prompt,
    }
    return success_response(data)


@router.get("/config/ollama-models", response_model=dict)
async def get_ollama_models(db: AsyncSession = Depends(get_db)):
    """向本地 Ollama 守护进程拉取已载入的本地大模型 tags 列表。"""
    cfg = await get_config(db)
    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER

    # 非 Ollama 模式无需查询
    if provider != "ollama":
        return success_response([])

    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    if not base_url:
        return success_response([])

    # 移除可能拼接的多余后缀，构造 Ollama tags api
    clean_base = base_url.rstrip("/")
    # 如果是以 /v1 结尾（常见于 OpenAI 模式配置），剥离它
    if clean_base.endswith("/v1"):
        clean_base = clean_base[:-3]

    url = f"{clean_base}/api/tags"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                tags_data = resp.json()
                models = [m["name"] for m in tags_data.get("models", [])]
                # 剔除 :latest 后缀，保留精简干净的名字
                clean_models = []
                for m in models:
                    if m.endswith(":latest"):
                        clean_models.append(m[:-7])
                    else:
                        clean_models.append(m)
                return success_response(sorted(list(set(clean_models))))
            else:
                logger.warning(f"ollama_tags_query_failed status={resp.status_code} url={url}")
    except Exception as e:
        logger.warning(f"ollama_tags_query_failed url={url} error=\"{e}\"")

    return success_response([])
