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
JOB_STALE_ENTRY_CLEANUP = "stale_entry_cleanup"
JOB_HEALTH_SCAN = "health_scan"


# ── 定时提炼任务 ────────────────────────────────────────────

async def _run_insight_extraction() -> None:
    """每日定时提炼：从 kb_qa_records 提炼知识点写入 kb_insights。"""
    from app.services.monitor_service import set_event_source
    set_event_source("scheduler")

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


# ── 过期条目清理 ──────────────────────────────────────────

async def _run_stale_entry_cleanup() -> None:
    """删除 3 天前推送但仍未提炼的 pending 外部条目。"""
    from app.services.monitor_service import set_event_source
    set_event_source("scheduler")

    from app.core.database import AsyncSessionLocal
    from app.services.external_push_service import cleanup_stale_pending_entries

    logger.info("stale_entry_cleanup_started trigger=scheduler")

    try:
        async with AsyncSessionLocal() as db:
            count = await cleanup_stale_pending_entries(db, days=3)
            await db.commit()
            logger.info(f"stale_entry_cleanup_completed deleted={count}")
    except Exception as exc:
        logger.error(f"stale_entry_cleanup_failed error=\"{exc}\"")


# ── 每周健康扫描 ──────────────────────────────────────────

async def _run_health_scan() -> None:
    """每周全库健康扫描：遍历所有 KB，生成诊断报告。"""
    from app.services.monitor_service import set_event_source
    set_event_source("scheduler")

    from app.core.database import AsyncSessionLocal
    from app.models.knowledge_base import KnowledgeBase
    from sqlalchemy import select

    logger.info("health_scan_batch_started trigger=scheduler")

    try:
        async with AsyncSessionLocal() as db:
            kbs = (await db.execute(select(KnowledgeBase))).scalars().all()
            total_reports = 0
            for kb in kbs:
                try:
                    from app.services.health_service import scan_health
                    report = await scan_health(db, kb.id, scan_type="scheduled")
                    total_reports += 1
                except Exception as exc:
                    logger.error(f"health_scan_kb_failed kb_id={kb.id} error=\"{exc}\"")
            await db.commit()
            logger.info(f"health_scan_batch_completed kbs_scanned={len(kbs)} reports={total_reports}")
    except Exception as exc:
        logger.error(f"health_scan_batch_failed error=\"{exc}\"")


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

    scheduler.add_job(
        _run_stale_entry_cleanup,
        trigger=CronTrigger(hour=int(hour), minute=int(minute)),
        id=JOB_STALE_ENTRY_CLEANUP,
        name="过期外部条目清理（3天）",
        replace_existing=True,
    )
    logger.info(f"scheduler_job_registered job={JOB_STALE_ENTRY_CLEANUP} schedule={schedule_time}")

    # 每周日 03:00 全库健康扫描
    scheduler.add_job(
        _run_health_scan,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=7),
        id=JOB_HEALTH_SCAN,
        name="每周全库健康扫描",
        replace_existing=True,
    )
    logger.info(f"scheduler_job_registered job={JOB_HEALTH_SCAN} schedule=sunday_03:07")


def shutdown_scheduler() -> None:
    """在应用关闭时停止调度器。"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_shutdown")
