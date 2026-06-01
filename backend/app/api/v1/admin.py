"""管理员运维接口（demo 种子数据导入等）。"""
from fastapi import APIRouter

from app.schemas.common import success_response
from app.seed_demo import seed

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed-demo")
async def seed_demo_data():
    """触发 Demo 种子数据写入（幂等，每次清空旧数据并重建）。"""
    await seed()
    return success_response({"seeded": True})
