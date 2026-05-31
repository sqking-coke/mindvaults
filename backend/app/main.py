import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.config import settings
from app.api.v1.router import api_router, public_router
from app.core.database import engine
from app.core.redis import close_redis
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    unhandled_exception_handler,
)
from app.core.middleware import limiter, request_log_middleware, ip_blacklist_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"mindvaults starting (env={settings.APP_ENV})")
    # 恢复上次异常中断的摄入任务
    from app.core.database import AsyncSessionLocal
    from app.services.ingestion_service import recover_stuck_documents
    recovered = await recover_stuck_documents(AsyncSessionLocal)
    if recovered:
        logger.info(f"lifespan_recovered_stuck_documents count={recovered}")
    yield
    await close_redis()
    await engine.dispose()
    logger.info("mindvaults shut down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="mindvaults API",
        description="本地私有知识库问答系统",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # IP 黑名单（demo 模式生效，需在日志中间件之前）
    app.middleware("http")(ip_blacklist_middleware)

    # 请求日志中间件
    app.middleware("http")(request_log_middleware)

    # 全局异常处理器
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # 路由注册
    app.include_router(public_router)
    app.include_router(api_router)

    # slowapi 限流
    app.state.limiter = limiter
    if not settings.RATE_LIMIT_ENABLED:
        limiter.enabled = False

    return app


def _setup_logging() -> None:
    logger.remove()

    # 统一日志格式（毫秒级 + trace_id + session_id）
    LOG_FORMAT = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "[<yellow>{extra[trace_id]:>16}</yellow>] | "
        "[<blue>{extra[session_id]:>12}</blue>] | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    # stderr（带颜色）
    logger.add(sys.stderr, level=settings.LOG_LEVEL, format=LOG_FORMAT)

    # 文件（无颜色，适合日志采集）
    log_dir = Path(settings.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    logger.add(
        log_dir / "mindvaults_{time:YYYY-MM-DD}.log",
        level=settings.LOG_LEVEL,
        format=LOG_FORMAT,
        rotation="00:00",
        retention=f"{settings.LOG_RETENTION} days",
        encoding="utf-8",
        colorize=False,
    )

    # 默认 extra 值（无中间件上下文时使用）
    logger.configure(extra={"trace_id": "—", "session_id": "—"})


_setup_logging()
app = create_app()
