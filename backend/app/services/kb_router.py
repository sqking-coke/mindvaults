"""KB 智能路由 — 三层降级匹配。

Layer 1: 质心向量匹配（< 1ms，零 LLM 成本）
Layer 2: LLM 语义路由（~200-500ms，轻量调用）
Layer 3: 用户引导（前端展示选项）
"""
import json
import math

import httpx
from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.knowledge_base import KnowledgeBase
from app.models.document import KbDocument
from app.models.chunk import KbChunk


def _cosine_distance(a: list[float], b: list[float]) -> float:
    """计算两个向量的余弦距离 (1 - cosine_similarity)。"""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 1.0  # 零向量视为完全不相似
    return 1.0 - dot / (norm_a * norm_b)


async def match_kb_by_centroid(
    db: AsyncSession,
    question_embedding: list[float],
    centroid_threshold: float,
    centroid_gap: float,
) -> dict | None:
    """Layer 1：质心向量匹配。

    查询所有有质心向量的 KB，计算与问题向量的余弦距离。
    第一名距离 ≤ threshold 且与第二名差距 ≥ gap 时命中。

    返回 {"kb_id", "kb_name", "distance", "method": "centroid"} 或 None。
    """
    rows = (await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.centroid_embedding.is_not(None))
    )).scalars().all()

    if not rows:
        logger.debug("centroid_match_no_candidates no KB with centroid")
        return None

    # 计算所有 KB 的余弦距离
    results = []
    for kb in rows:
        if kb.centroid_embedding is None:
            continue
        dist = _cosine_distance(kb.centroid_embedding, question_embedding)
        results.append((kb, dist))

    if not results:
        return None

    results.sort(key=lambda x: x[1])
    first_kb, first_dist = results[0]
    second_dist = results[1][1] if len(results) > 1 else None

    # 第一名距离超过阈值 → 不匹配
    if first_dist > centroid_threshold:
        logger.debug(
            f"centroid_match_all_miss first_dist={first_dist:.4f} "
            f"threshold={centroid_threshold} kb_count={len(results)}"
        )
        return None

    # 前两名差距太小 → 降级 Layer 2 做语义判断
    if second_dist is not None and (second_dist - first_dist) < centroid_gap:
        logger.debug(
            f"centroid_match_too_close first=({first_kb.id}, {first_dist:.4f}) "
            f"second=({results[1][0].id}, {second_dist:.4f}) gap={centroid_gap}"
        )
        return None

    logger.info(
        f"centroid_match_hit kb_id={first_kb.id} kb_name={first_kb.name} "
        f"distance={first_dist:.4f}"
    )
    return {
        "kb_id": first_kb.id,
        "kb_name": first_kb.name,
        "distance": round(first_dist, 4),
        "method": "centroid",
    }


async def route_kb_by_llm(
    db: AsyncSession,
    question: str,
    kb_candidates: list[dict],
    provider: str,
    base_url: str,
    model: str,
    api_key: str | None,
    confidence_threshold: float,
) -> dict | None:
    """Layer 2：LLM 语义路由。

    将问题 + 所有可选 KB（name + description）发送给 LLM，
    返回 JSON {"kb_id": N, "confidence": 0.XX}。temperature=0，非流式。

    - 校验返回的 kb_id 真实存在
    - confidence < threshold → 降级
    - 任何异常 → 降级（不崩溃）

    返回 {"kb_id", "kb_name", "confidence", "method": "llm_route"} 或 None。
    """
    # 构建 prompt
    kb_lines = []
    for kb in kb_candidates:
        desc = kb.get("description", "") or ""
        kb_lines.append(f"  {kb['id']}. {kb['name']}" + (f" — {desc}" if desc else ""))
    kb_list = "\n".join(kb_lines)

    system_prompt = (
        "你是一个知识库路由助手。根据用户的问题，选择最匹配的知识库。"
        "只返回 JSON 对象，不要有其他文字。"
    )
    user_prompt = (
        f"用户问题：「{question}」\n\n"
        f"可选知识库：\n{kb_list}\n\n"
        f'返回 JSON 格式：{{"kb_id": <数字>, "confidence": <0到1之间的浮点数>}}'
    )

    try:
        # 非流式调用
        response_text = await _llm_non_stream(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            provider=provider,
            base_url=base_url,
            model=model,
            api_key=api_key,
            temperature=0,
        )

        # 尝试从响应中提取 JSON
        result = _parse_json_response(response_text)
        if result is None:
            logger.warning(f"llm_route_parse_failed response={response_text[:200]}")
            return None

        kb_id = result.get("kb_id")
        confidence = result.get("confidence", 0)

        # 校验 kb_id 真实存在
        target_kb = await db.get(KnowledgeBase, kb_id)
        if target_kb is None:
            logger.warning(f"llm_route_invalid_kb_id returned_kb_id={kb_id}")
            return None

        if confidence < confidence_threshold:
            logger.info(
                f"llm_route_miss kb_id={kb_id} kb_name={target_kb.name} "
                f"confidence={confidence:.2f} threshold={confidence_threshold}"
            )
            return None

        logger.info(
            f"llm_route_hit kb_id={kb_id} kb_name={target_kb.name} "
            f"confidence={confidence:.2f}"
        )
        return {
            "kb_id": target_kb.id,
            "kb_name": target_kb.name,
            "confidence": round(confidence, 4),
            "method": "llm_route",
        }

    except Exception:
        logger.error(f"llm_route_failed question_len={len(question)}")
        return None


async def resolve_kb(
    db: AsyncSession,
    question: str,
    question_embedding: list[float],
    kb_id: int | None,
    sys_cfg,  # SystemConfig
    provider: str,
    base_url: str,
    model: str,
    api_key: str | None,
) -> tuple[int | None, dict | None]:
    """KB 路由主流程。

    kb_id 含义：
    - None → 自动路由（Layer 1 → Layer 2 → Layer 3）
    - 0 → 全库搜索
    - N > 0 → 指定 KB

    返回 (resolved_kb_id, routing_event)。
    routing_event 供 SSE thinking 流输出，包含 phase="routing"。
    Layer 3 未命中时返回 (None, fallback_event)。
    """
    # 用户明确指定 → 直接验证返回
    if kb_id is not None and kb_id > 0:
        kb = await db.get(KnowledgeBase, kb_id)
        if kb is not None:
            return kb_id, {
                "phase": "routing",
                "kb_id": kb.id,
                "kb_name": kb.name,
                "method": "manual",
                "confidence": 1.0,
                "message": f"用户指定: {kb.name}",
            }
        # 指定的 KB 不存在 → 回退自动路由
        logger.warning(f"resolve_kb_specified_not_found kb_id={kb_id} → fallback")

    # kb_id=0 → 全库搜索
    if kb_id == 0:
        return 0, None

    # kb_id=None → 三层路由
    thresholds = {
        "centroid": sys_cfg.route_centroid_threshold if sys_cfg else 0.40,
        "gap": sys_cfg.route_centroid_gap if sys_cfg else 0.08,
        "llm_confidence": sys_cfg.route_llm_confidence if sys_cfg else 0.60,
    }

    # Layer 1: 质心匹配
    result = await match_kb_by_centroid(
        db, question_embedding,
        centroid_threshold=thresholds["centroid"],
        centroid_gap=thresholds["gap"],
    )
    if result:
        event = {
            "phase": "routing",
            "kb_id": result["kb_id"],
            "kb_name": result["kb_name"],
            "method": result["method"],
            "confidence": round(1.0 - result["distance"], 4),
            "message": f"质心匹配: {result['kb_name']} (距离 {result['distance']:.3f})",
        }
        return result["kb_id"], event

    # Layer 2: LLM 语义路由
    # 获取候选 KB 列表（有文档的 KB）
    candidate_rows = (await db.execute(
        select(KnowledgeBase.id, KnowledgeBase.name, KnowledgeBase.description)
        .join(KbDocument, KbDocument.kb_id == KnowledgeBase.id)
        .where(KbDocument.deleted_at.is_(None))
        .distinct()
    )).all()

    if not candidate_rows:
        logger.debug("resolve_kb_no_candidates")
        return None, {
            "phase": "routing",
            "method": "fallback",
            "confidence": 0,
            "message": "无可用知识库（请先上传文档）",
            "no_candidates": True,
        }

    candidates = [
        {"id": r.id, "name": r.name, "description": r.description or ""}
        for r in candidate_rows
    ]

    result = await route_kb_by_llm(
        db, question, candidates,
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
        confidence_threshold=thresholds["llm_confidence"],
    )
    if result:
        event = {
            "phase": "routing",
            "kb_id": result["kb_id"],
            "kb_name": result["kb_name"],
            "method": result["method"],
            "confidence": result["confidence"],
            "message": f"LLM 路由: {result['kb_name']} (置信度 {result['confidence']:.2f})",
        }
        return result["kb_id"], event

    # Layer 3: 用户引导
    return None, {
        "phase": "routing",
        "method": "fallback",
        "confidence": 0,
        "message": "未能确定匹配知识库，请手动选择",
        "candidates": [
            {"kb_id": c["id"], "kb_name": c["name"]}
            for c in candidates
        ],
    }


# ═══════════════════════════════════════════════════════════
# 内部辅助
# ═══════════════════════════════════════════════════════════

def _parse_json_response(text: str) -> dict | None:
    """从 LLM 响应中提取 JSON 对象。尝试直接解析和提取 ```json``` 块。"""
    if not text:
        return None

    # 1. 直接尝试整个文本
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # 2. 提取 ```json ... ``` 块
    import re
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text.strip())
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3. 提取第一个 { ... } 对象
    match = re.search(r'\{[^{}]*\}', text.strip())
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


async def _llm_non_stream(
    system_prompt: str,
    user_prompt: str,
    provider: str,
    base_url: str,
    model: str,
    api_key: str | None,
    temperature: float = 0,
) -> str:
    """非流式 LLM 调用，返回完整响应文本。用于结构化输出（如路由）。"""
    if provider == "ollama":
        url = f"{base_url.rstrip('/')}/api/chat"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {"temperature": temperature},
        }
        headers = {"Content-Type": "application/json"}
    else:
        # OpenAI 兼容
        base = base_url.rstrip('/')
        url = f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "temperature": temperature,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    if provider == "ollama":
        return data.get("message", {}).get("content", "")
    else:
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
