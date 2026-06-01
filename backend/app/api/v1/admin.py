"""管理员运维接口（demo 种子数据导入等）。"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.schemas.common import success_response
from app.seed_demo import seed

router = APIRouter(prefix="/admin", tags=["admin"])


class SeedRequest(BaseModel):
    llm_api_key: str = Field(default="", description="LLM API Key（可选，优先于系统配置）")
    embedding_api_key: str = Field(default="", description="Embedding API Key（可选，优先于系统配置）")


@router.post("/seed-demo")
async def seed_demo_data(body: SeedRequest = SeedRequest()):
    """触发 Demo 种子数据写入（幂等，每次清空旧数据并重建）。"""
    await seed(
        llm_api_key=body.llm_api_key or None,
        embedding_api_key=body.embedding_api_key or None,
    )
    return success_response({"seeded": True})
