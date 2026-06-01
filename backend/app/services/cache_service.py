import hashlib
import json
import struct

import redis.asyncio as aioredis
from loguru import logger

from app.config import settings
from app.schemas.chat import RefChunk

CACHE_KEY_PREFIX = "retrieval"


def _hash_embedding(embedding: list[float]) -> str:
    """将 embedding 向量序列化为 bytes 后取 MD5 摘要。"""
    packed = struct.pack(f"{len(embedding)}f", *embedding)
    return hashlib.md5(packed).hexdigest()


class CacheService:
    """Redis 检索缓存服务。不可用时自动降级，不抛异常。"""

    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis
        self._enabled = settings.REDIS_CACHE_ENABLED
        self._ttl = settings.REDIS_CACHE_TTL

    async def get_retrieval(self, embedding: list[float], kb_id: int = 0) -> list[RefChunk] | None:
        """从缓存读取检索结果。未命中或异常时返回 None。"""
        if not self._enabled:
            return None
        key = f"{CACHE_KEY_PREFIX}:{kb_id}:{_hash_embedding(embedding)}"
        try:
            raw = await self._redis.get(key)
            if raw is None:
                return None
            items = json.loads(raw)
            return [RefChunk(**item) for item in items]
        except Exception:
            logger.opt(exception=True).warning("Redis 缓存读取失败，降级至直接查库")
            return None

    async def set_retrieval(
        self, embedding: list[float], chunks: list[RefChunk], kb_id: int = 0
    ) -> None:
        """将检索结果写入缓存。异常时静默降级。"""
        if not self._enabled:
            return
        key = f"{CACHE_KEY_PREFIX}:{kb_id}:{_hash_embedding(embedding)}"
        try:
            payload = json.dumps([c.model_dump() for c in chunks], ensure_ascii=False)
            await self._redis.setex(key, self._ttl, payload)
            logger.debug(f"检索缓存已写入: key={key} chunks={len(chunks)}")
        except Exception:
            logger.opt(exception=True).warning("Redis 缓存写入失败")

    async def invalidate(self) -> None:
        """清空所有检索缓存 (retrieval:*)。"""
        if not self._enabled:
            return
        try:
            deleted = 0
            async for key in self._redis.scan_iter(match=f"{CACHE_KEY_PREFIX}:*", count=100):
                await self._redis.delete(key)
                deleted += 1
            logger.info(f"检索缓存已清空, 共 {deleted} 个 key")
        except Exception:
            logger.opt(exception=True).warning("Redis 缓存清空失败")
