"""生成监控看板演示数据 — 覆盖近 7 天各模块事件。

用法: cd backend && source venv/bin/activate && python seed_monitor_data.py
"""
import asyncio
import random
from datetime import datetime, timedelta, timezone

from app.core.database import AsyncSessionLocal
from app.models.monitor_event import KbMonitorEvent

# KB 名称映射
KB_NAMES = {1: "Python 技术文档", 2: "产品 PRD", 3: "运维手册", 4: "前端设计规范"}


async def seed():
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    async with AsyncSessionLocal() as db:
        # ── 1. 路由事件（近 7 天，每天 100-180 次）────
        for day_offset in range(6, -1, -1):
            day = today_start - timedelta(days=day_offset)
            total = random.randint(100, 180)
            centroid_rate = 0.78 + day_offset * 0.015 + random.uniform(-0.03, 0.03)
            llm_rate = 0.08 + day_offset * 0.01 + random.uniform(-0.02, 0.02)

            for i in range(total):
                hour = random.randint(8, 22)
                minute = random.randint(0, 59)
                ts = day.replace(hour=hour, minute=minute, second=random.randint(0, 59))

                r = random.random()
                kb_id = random.choice([1, 1, 1, 2, 2, 3])  # Python docs most popular

                if r < centroid_rate:
                    db.add(KbMonitorEvent(
                        category="routing", event="centroid_hit", kb_id=kb_id,
                        value_float=round(random.uniform(0.05, 0.30), 4),
                        status="success", created_at=ts,
                    ))
                elif r < centroid_rate + llm_rate:
                    db.add(KbMonitorEvent(
                        category="routing", event="llm_route_hit", kb_id=kb_id,
                        value_float=round(random.uniform(0.60, 0.95), 4),
                        status="success", created_at=ts,
                    ))
                elif r < 0.97:
                    db.add(KbMonitorEvent(
                        category="routing", event="route_fallback", kb_id=kb_id,
                        status="warning", created_at=ts,
                    ))
                else:
                    db.add(KbMonitorEvent(
                        category="routing", event="route_manual", kb_id=random.choice([1, 2, 3, 4]),
                        status="success", created_at=ts,
                    ))

        # ── 2. LLM 调用事件（今日）────────────
        for i in range(1200):
            hour = random.randint(0, 23)
            minute = random.randint(0, 59)
            ts = now.replace(hour=hour, minute=minute, second=random.randint(0, 59))

            dur = max(0.2, random.gauss(1.5, 1.2))
            total_tokens = random.randint(200, 8000)

            db.add(KbMonitorEvent(
                category="system", event="llm_call_completed",
                value_float=round(dur, 3),
                value_int=total_tokens,
                status="success", created_at=ts,
                extra_json={"input_tokens": int(total_tokens * 0.85), "output_tokens": int(total_tokens * 0.15)},
            ))

        # 模拟 1 次 LLM 失败
        db.add(KbMonitorEvent(
            category="system", event="llm_call_failed",
            status="failed", message="LLM API timeout",
            created_at=now - timedelta(minutes=20),
        ))

        # ── 3. 路由失败事件（制造 2 条告警）────
        db.add(KbMonitorEvent(
            category="routing", event="llm_route_failed",
            kb_id=3, status="failed",
            message="centroid_update_failed: division by zero",
            created_at=now - timedelta(minutes=15),
        ))
        db.add(KbMonitorEvent(
            category="routing", event="centroid_update_failed",
            kb_id=3, status="failed",
            message="centroid_update_failed: division by zero",
            created_at=now - timedelta(minutes=30),
        ))

        # ── 4. 提炼事件（本周）────────────
        for day_offset in range(6, -1, -1):
            day = today_start - timedelta(days=day_offset)
            ts = day.replace(hour=2, minute=30)

            if day_offset > 0:  # 过去 6 天每天一批
                extracted = random.randint(8, 18)
                db.add(KbMonitorEvent(
                    category="insight", event="insight_batch_started",
                    value_int=random.randint(40, 80), status="success",
                    extra_json={"native": random.randint(30, 60), "external": random.randint(10, 20)},
                    created_at=ts - timedelta(hours=1),
                ))
                db.add(KbMonitorEvent(
                    category="insight", event="insight_batch_completed",
                    value_int=extracted, value_float=round(random.uniform(30, 120), 1),
                    status="success",
                    extra_json={"skipped": random.randint(20, 50), "errors": 0, "auto_approved": extracted - random.randint(0, 3)},
                    created_at=ts,
                ))

        # 今天也来一批
        db.add(KbMonitorEvent(
            category="insight", event="insight_batch_completed",
            value_int=12, value_float=85.3,
            status="success",
            extra_json={"skipped": 35, "errors": 0, "auto_approved": 10},
            created_at=now - timedelta(hours=2),
        ))

        # ── 5. 概念抽取事件（本周）─────────
        for day_offset in [1, 2, 3, 5, 6]:
            day = today_start - timedelta(days=day_offset)
            ts = day.replace(hour=3, minute=0)
            created = random.randint(3, 10)
            db.add(KbMonitorEvent(
                category="concept", event="concept_extraction_completed",
                value_int=created, status="success",
                extra_json={"chunks": random.randint(20, 60), "created": created, "updated": random.randint(0, 3)},
                created_at=ts,
            ))

        # 今天一次概念抽取失败
        db.add(KbMonitorEvent(
            category="concept", event="concept_extraction_failed",
            kb_id=2, status="failed",
            message="LLM returned empty response",
            created_at=now - timedelta(minutes=45),
        ))

        # ── 6. 健康扫描事件（本周）─────────
        for day_offset in [3, 6]:
            day = today_start - timedelta(days=day_offset)
            ts = day.replace(hour=4, minute=0)
            for kb in [1, 2, 3]:
                score = random.uniform(65, 95)
                db.add(KbMonitorEvent(
                    category="health", event="health_scan_completed",
                    kb_id=kb, value_float=round(score, 1),
                    status="success",
                    extra_json={
                        "health_score": round(score, 1),
                        "duplicates": random.randint(0, 5),
                        "low_quality": random.randint(0, 10),
                        "outdated": random.randint(0, 3),
                        "orphans": random.randint(0, 2),
                    },
                    created_at=ts,
                ))

        # ── 7. 外部推送事件 ────────────────
        for hour_offset in range(1, 24, 4):
            ts = now - timedelta(hours=hour_offset)
            success = random.randint(2, 6)
            db.add(KbMonitorEvent(
                category="external", event="external_push_received",
                value_int=success, status="success",
                extra_json={"platform": "claude_code", "skipped": random.randint(0, 1), "rejected": 0},
                created_at=ts,
            ))
        # 仅 2 条推送失败
        for mins in [25, 180]:
            db.add(KbMonitorEvent(
                category="external", event="external_push_failed",
                status="failed",
                extra_json={"platform": "claude_code"},
                message="API Key invalid",
                created_at=now - timedelta(minutes=mins),
            ))

        await db.commit()
        print("✅ 演示数据写入完成！")


if __name__ == "__main__":
    asyncio.run(seed())
