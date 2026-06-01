import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.config import settings
from app.api.deps import get_db
from app.models.system_config import SystemConfig
from app.schemas.config import SystemConfigResponse, SystemConfigRequest
from app.schemas.common import success_response

router = APIRouter()


def _mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••••••"
    return f"{key[:4]}••••••••{key[-4:]}"


async def _get_or_create_system_config(db: AsyncSession) -> SystemConfig:
    row = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
    if row is None:
        row = SystemConfig(id=1)
        db.add(row)
        await db.flush()
        await db.commit()
    return row


@router.get("/config", response_model=dict)
async def get_system_config(db: AsyncSession = Depends(get_db)):
    cfg = await _get_or_create_system_config(db)

    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER
    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    model = cfg.llm_model if cfg.llm_model is not None else settings.LLM_MODEL
    raw_key = cfg.llm_api_key if cfg.llm_api_key is not None else settings.LLM_API_KEY
    masked_key = _mask_api_key(raw_key)

    system_prompt = cfg.system_prompt if cfg.system_prompt is not None else ""

    emb_provider = cfg.embedding_provider if cfg.embedding_provider is not None else "same_as_llm"
    emb_url = cfg.embedding_base_url if cfg.embedding_base_url is not None else ""
    emb_model = cfg.embedding_model if cfg.embedding_model is not None else ""
    emb_raw_key = cfg.embedding_api_key if cfg.embedding_api_key is not None else ""
    emb_masked_key = _mask_api_key(emb_raw_key)

    return success_response({
        "llm_provider": provider, "llm_base_url": base_url,
        "llm_model": model, "llm_api_key": masked_key,
        "llm_temperature": cfg.llm_temperature,
        "system_prompt": system_prompt,
        "embedding_provider": emb_provider, "embedding_base_url": emb_url,
        "embedding_model": emb_model, "embedding_api_key": emb_masked_key,
    })


@router.put("/config", response_model=dict)
async def update_system_config(payload: SystemConfigRequest, db: AsyncSession = Depends(get_db)):
    cfg = await _get_or_create_system_config(db)

    if payload.llm_provider is not None:
        cfg.llm_provider = payload.llm_provider.strip().lower()
    if payload.llm_base_url is not None:
        cfg.llm_base_url = payload.llm_base_url.strip()
    if payload.llm_model is not None:
        cfg.llm_model = payload.llm_model.strip()
    if payload.llm_api_key is not None:
        k = payload.llm_api_key.strip()
        if k and "••" not in k:
            cfg.llm_api_key = k
        elif not k:
            cfg.llm_api_key = ""
    if payload.llm_temperature is not None:
        cfg.llm_temperature = payload.llm_temperature
    if payload.system_prompt is not None:
        cfg.system_prompt = payload.system_prompt.strip()

    if payload.embedding_provider is not None:
        cfg.embedding_provider = payload.embedding_provider.strip()
    if payload.embedding_base_url is not None:
        cfg.embedding_base_url = payload.embedding_base_url.strip()
    if payload.embedding_model is not None:
        cfg.embedding_model = payload.embedding_model.strip()
    if payload.embedding_api_key is not None:
        k = payload.embedding_api_key.strip()
        if k and "••" not in k:
            cfg.embedding_api_key = k
        elif not k:
            cfg.embedding_api_key = ""

    await db.commit()
    await db.refresh(cfg)

    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER
    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    model = cfg.llm_model if cfg.llm_model is not None else settings.LLM_MODEL
    masked_key = _mask_api_key(cfg.llm_api_key if cfg.llm_api_key is not None else settings.LLM_API_KEY)
    system_prompt = cfg.system_prompt if cfg.system_prompt is not None else ""
    emb_masked_key = _mask_api_key(cfg.embedding_api_key if cfg.embedding_api_key is not None else "")

    return success_response({
        "llm_provider": provider, "llm_base_url": base_url,
        "llm_model": model, "llm_api_key": masked_key,
        "llm_temperature": cfg.llm_temperature,
        "system_prompt": system_prompt,
        "embedding_provider": cfg.embedding_provider or "same_as_llm",
        "embedding_base_url": cfg.embedding_base_url or "",
        "embedding_model": cfg.embedding_model or "",
        "embedding_api_key": emb_masked_key,
    })


@router.get("/config/ollama-models", response_model=dict)
async def get_ollama_models(db: AsyncSession = Depends(get_db)):
    cfg = await _get_or_create_system_config(db)
    provider = cfg.llm_provider if cfg.llm_provider is not None else settings.LLM_PROVIDER

    if provider != "ollama":
        return success_response([])

    base_url = cfg.llm_base_url if cfg.llm_base_url is not None else settings.LLM_BASE_URL
    if not base_url:
        return success_response([])

    clean_base = base_url.rstrip("/")
    if clean_base.endswith("/v1"):
        clean_base = clean_base[:-3]

    url = f"{clean_base}/api/tags"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                tags_data = resp.json()
                models = [m["name"] for m in tags_data.get("models", [])]
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
