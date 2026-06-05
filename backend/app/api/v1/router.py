from fastapi import APIRouter, Depends
from app.api.v1.health import router as health_router
from app.api.v1.documents import router as documents_router
from app.api.v1.chat import router as chat_router
from app.api.v1.retrieval import router as retrieval_router
from app.api.v1.stats import router as stats_router
from app.api.v1.chunks import router as chunks_router
from app.api.v1.config import router as config_router
from app.api.v1.vault import router as vault_router
from app.api.v1.knowledge_bases import router as kb_router
from app.api.v1.insights import router as insights_router
from app.api.v1.external import external_push_router, deposition_config_router
from app.api.deps import verify_api_key

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_api_key)])
api_router.include_router(documents_router, prefix="/kb")
api_router.include_router(chat_router, prefix="/kb")
api_router.include_router(retrieval_router, prefix="/kb")
api_router.include_router(stats_router, prefix="/kb")
api_router.include_router(chunks_router, prefix="/kb")
api_router.include_router(config_router, prefix="/kb")
api_router.include_router(vault_router, prefix="/kb")
api_router.include_router(kb_router, prefix="/kb")
api_router.include_router(insights_router, prefix="/kb")
api_router.include_router(deposition_config_router, prefix="/kb")

# Health check + external push (uses own KB-level API key auth, no global auth)
public_router = APIRouter(prefix="/api/v1")
public_router.include_router(health_router)
public_router.include_router(external_push_router, prefix="/kb")
