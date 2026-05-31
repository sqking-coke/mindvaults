import platform

import psutil
from fastapi import APIRouter
from loguru import logger

from app.config import settings
from app.core.redis import get_redis

router = APIRouter(tags=["health"])

router = APIRouter(tags=["health"])

# CPU 信息启动时采集一次（不变）
_CPU_INFO: dict | None = None


def _collect_cpu_info() -> dict:
    cpu_name = "Unknown"
    try:
        import subprocess
        result = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            cpu_name = result.stdout.strip()
    except Exception:
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        cpu_name = line.split(":", 1)[1].strip()
                        break
        except Exception:
            cpu_name = platform.processor() or platform.machine()

    return {
        "cpu_name": cpu_name,
        "cpu_cores_logical": psutil.cpu_count(logical=True) or 0,
        "cpu_cores_physical": psutil.cpu_count(logical=False) or 0,
    }


def _init_cpu_info():
    global _CPU_INFO
    if _CPU_INFO is None:
        _CPU_INFO = _collect_cpu_info()
        logger.info(f"cpu_info_collected cpu={_CPU_INFO['cpu_name'][:30]}")


_init_cpu_info()


def _fmt_bytes(b: int) -> str:
    if b >= 1024 ** 3:
        return f"{b / (1024**3):.1f} GB"
    return f"{b / (1024**2):.0f} MB"


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


@router.get("/health/system")
async def system_info():
    """CPU 信息启动时采集，内存信息实时读取。"""
    mem = psutil.virtual_memory()
    used_pct = round((mem.used / mem.total) * 100) if mem.total > 0 else 0
    return {
        "code": 0,
        "data": {
            **_CPU_INFO,
            "memory_total": _fmt_bytes(mem.total),
            "memory_used": _fmt_bytes(mem.used),
            "memory_percent": used_pct,
        },
    }
