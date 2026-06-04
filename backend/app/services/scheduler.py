"""后台任务调度器 — 基于 APScheduler AsyncIOScheduler。

职责：
- 注册定时任务（每日 insight 提炼等）
- 在 FastAPI lifespan 中启动/关闭
- 任务配置从 system_config 读取
"""

from loguru import logger
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")

# ── 已注册任务 ID ───────────────────────────────────────────

JOB_INSIGHT_EXTRACTION = "insight_extraction"


# ── 定时提炼任务 ────────────────────────────────────────────

async def _run_insight_extraction() -> None:
    """每日定时提炼：从 kb_qa_records 提炼知识点写入 kb_insights。"""
    from app.core.database import AsyncSessionLocal
    from app.models.system_config import SystemConfig
    from sqlalchemy import select

    logger.info("insight_batch_started trigger=scheduler")

    try:
        async with AsyncSessionLocal() as db:
            sys_cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
            if sys_cfg is None or not sys_cfg.insight_extraction_enabled:
                logger.info("insight_batch_skipped reason=disabled")
                return

            from app.services.insight_service import extract_insights
            stats = await extract_insights(db, sys_cfg)

            await db.commit()
            logger.info(
                f"insight_batch_completed extracted={stats['extracted']} "
                f"skipped_short={stats['skipped_short']} skipped_duplicate={stats['skipped_duplicate']} "
                f"auto_approved={stats['auto_approved']}"
            )

    except Exception as exc:
        logger.error(f"insight_batch_failed error=\"{exc}\"")


def init_scheduler() -> None:
    """在应用启动时注册所有定时任务。调度时间从 system_config 读取。"""
    from app.core.database import AsyncSessionLocal
    from app.models.system_config import SystemConfig
    from sqlalchemy import select
    import asyncio

    schedule_time = "02:00"  # 默认值（fallback）

    async def _resolve_schedule() -> str:
        try:
            async with AsyncSessionLocal() as db:
                cfg = (await db.execute(select(SystemConfig).where(SystemConfig.id == 1))).scalar_one_or_none()
                if cfg and cfg.insight_extraction_schedule:
                    return cfg.insight_extraction_schedule
        except Exception:
            logger.warning("scheduler_resolve_schedule_failed using_default=02:00")
        return "02:00"

    try:
        loop = asyncio.get_event_loop()
        schedule_time = loop.run_until_complete(_resolve_schedule())
    except Exception:
        pass

    hour, minute = schedule_time.split(":")
    scheduler.add_job(
        _run_insight_extraction,
        trigger=CronTrigger(hour=int(hour), minute=int(minute)),
        id=JOB_INSIGHT_EXTRACTION,
        name="每日对话知识提炼",
        replace_existing=True,
    )
    logger.info(f"scheduler_job_registered job={JOB_INSIGHT_EXTRACTION} schedule={schedule_time}")


def shutdown_scheduler() -> None:
    """在应用关闭时停止调度器。"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_shutdown")
