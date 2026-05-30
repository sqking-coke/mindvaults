import platform

import psutil
from fastapi import APIRouter
from loguru import logger

from app.config import settings
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


def _redis_status() -> str:
    return "connected" if settings.REDIS_CACHE_ENABLED else "disabled"


@router.get("/health")
async def health_check():
    """服务健康检查。返回数据库、Redis、模型状态。"""
    redis_status = _redis_status()
    if settings.REDIS_CACHE_ENABLED:
        try:
            r = await get_redis()
            await r.ping()
        except Exception:
            logger.opt(exception=True).warning("Redis 健康检查失败")
            redis_status = "disconnected"

    return {
        "code": 0,
        "data": {
            "status": "ok",
            "database": "connected",
            "redis": redis_status,
            "embedding_model": settings.EMBEDDING_MODEL,
            "llm_model": settings.LLM_MODEL,
        },
    }


def _get_cpu_name() -> str:
    """获取 CPU 名称（跨平台）。"""
    try:
        # macOS
        import subprocess
        result = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    # Linux fallback
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except Exception:
        pass

    # Generic fallback
    return platform.processor() or platform.machine() or "Unknown"


@router.get("/health/system")
async def system_info():
    """返回宿主机 CPU、内存等系统信息。"""
    mem = psutil.virtual_memory()
    cpu_name = _get_cpu_name()

    def _fmt_bytes(b: int) -> str:
        if b >= 1024 ** 3:
            return f"{b / (1024**3):.1f} GB"
        return f"{b / (1024**2):.0f} MB"

    used_pct = round((mem.used / mem.total) * 100) if mem.total > 0 else 0

    return {
        "code": 0,
        "data": {
            "cpu_name": cpu_name,
            "cpu_cores_logical": psutil.cpu_count(logical=True),
            "cpu_cores_physical": psutil.cpu_count(logical=False),
            "memory_total": _fmt_bytes(mem.total),
            "memory_used": _fmt_bytes(mem.used),
            "memory_percent": used_pct,
        },
    }
