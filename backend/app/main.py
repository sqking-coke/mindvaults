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
from app.core.middleware import limiter, request_log_middleware, ip_blacklist_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"mindvaults starting (env={settings.APP_ENV})")

    from app.core.database import AsyncSessionLocal
    from sqlalchemy import select

    # 恢复上次异常中断的摄入任务
    from app.services.ingestion_service import recover_stuck_documents
    recovered = await recover_stuck_documents(AsyncSessionLocal)
    if recovered:
        logger.info(f"lifespan_recovered_stuck_documents count={recovered}")

    # 确保系统知识库存在（每次启动自愈）
    from app.models.knowledge_base import KnowledgeBase
    from app.models.config import KbConfig
    from app.models.system_config import SystemConfig
    from app.services.external_push_service import generate_api_key

    async with AsyncSessionLocal() as db:
        try:
            kb = await db.get(KnowledgeBase, 1)
            if kb is None:
                kb = KnowledgeBase(
                    id=1,
                    name="默认系统库",
                    description="系统自动创建的核心知识库，承载文档存储与对话知识沉淀。",
                    kb_type="general",
                )
                db.add(kb)
                await db.flush()
                logger.info("lifespan_created_system_kb id=1")

            cfg = await db.get(KbConfig, 1)
            if cfg is None:
                cfg = KbConfig(kb_id=1)
                db.add(cfg)
                await db.flush()

            sys_cfg = await db.get(SystemConfig, 1)
            if sys_cfg is None:
                sys_cfg = SystemConfig(id=1)
                db.add(sys_cfg)
                await db.flush()
                logger.info("lifespan_created_system_config id=1")
            if not sys_cfg.external_api_key:
                sys_cfg.external_api_key = generate_api_key()
                await db.flush()
                logger.info("lifespan_generated_external_api_key")
        except Exception as exc:
            logger.warning(f"lifespan_ensure_system_kb_failed error=\"{exc}\"")
        await db.commit()

    # 启动后台任务调度器
    from app.services.scheduler import init_scheduler, shutdown_scheduler, scheduler
    init_scheduler()
    scheduler.start()
    logger.info("lifespan_scheduler_started")

    yield

    shutdown_scheduler()
    await close_redis()
    await engine.dispose()
    logger.info("mindvaults shut down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="mindvaults API",
        description="本地私有知识库问答系统",
        version="1.0.0-beta",
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

    # IP 黑名单（demo 模式生效）
    app.middleware("http")(ip_blacklist_middleware)

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

    # MCP HTTP 传输（Docker/NAS 部署用，跨容器通信，可选）
    try:
        from app.mcp.server import create_sse_app as create_mcp_sse_app
        app.mount("/mcp", create_mcp_sse_app())
    except ImportError:
        logger.warning("mcp_not_available install with: pip install mcp")

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
