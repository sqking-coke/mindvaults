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
    ValidationException,
    app_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from app.core.middleware import limiter, request_log_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"mindvaults starting (env={settings.APP_ENV})")

    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text, select
    from app.models.system_config import SystemConfig

    # 自动建表 + 数据迁移：从 kb_config(kb_id=1) 复制到 system_config
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS system_config (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    llm_provider VARCHAR(50), llm_base_url VARCHAR(255),
                    llm_model VARCHAR(100), llm_api_key VARCHAR(255),
                    llm_temperature FLOAT DEFAULT 0.3 NOT NULL,
                    embedding_provider VARCHAR(50) DEFAULT 'same_as_llm',
                    embedding_base_url VARCHAR(255),
                    embedding_api_key VARCHAR(255),
                    embedding_model VARCHAR(100),
                    system_prompt TEXT,
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """))
            await db.commit()

            # 如果 system_config 为空，从 kb_config(kb_id=1) 迁移
            existing = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
            if existing is None:
                old = (await db.execute(text(
                    "SELECT llm_provider, llm_base_url, llm_model, llm_api_key, "
                    "llm_temperature, embedding_provider, embedding_base_url, "
                    "embedding_api_key, embedding_model, system_prompt "
                    "FROM kb_config WHERE kb_id = 1"
                ))).fetchone()
                if old:
                    await db.execute(text(
                        "INSERT INTO system_config (id, llm_provider, llm_base_url, llm_model, "
                        "llm_api_key, llm_temperature, embedding_provider, embedding_base_url, "
                        "embedding_api_key, embedding_model, system_prompt) "
                        "VALUES (1, :p1, :p2, :p3, :p4, :p5, :p6, :p7, :p8, :p9, :p10)"
                    ), {"p1": old[0], "p2": old[1], "p3": old[2], "p4": old[3],
                        "p5": old[4] or 0.3, "p6": old[5] or "same_as_llm",
                        "p7": old[6], "p8": old[7], "p9": old[8], "p10": old[9]})
                    await db.commit()
                    logger.info("lifespan_migrated kb_config → system_config")
        except Exception as exc:
            logger.warning(f"lifespan_migration_skipped error=\"{exc}\"")

    # 恢复上次异常中断的摄入任务
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

    # 请求日志中间件
    app.middleware("http")(request_log_middleware)

    # 全局异常处理器
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(ValidationException, validation_exception_handler)
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
