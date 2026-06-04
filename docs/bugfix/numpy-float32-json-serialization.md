# numpy.float32 JSON 序列化崩溃

> 日期：2026-06-04 | 影响版本：v0.5.0

## 现象

```
ERROR | unhandled_exception error="Object of type float32 is not JSON serializable"
WARNING | redis_push_thinking_failed session_id=... round_key=... phase=routing
```

质心匹配成功，但推送 thinking 到 Redis 时 `json.dumps(step)` 崩溃。

## 根因

pgvector + numpy 环境下，数据库返回的向量元素是 `numpy.float32`。关键陷阱：

```python
>>> round(np.float32(0.3769), 4)
np.float32(0.3769)    # ← 仍然是 numpy.float32，不是 Python float！

>>> json.dumps({"x": np.float32(0.1)})
TypeError: Object of type float32 is not JSON serializable
```

**`round(numpy.float32, N)` 不会自动转 Python `float`**。任何涉及 pgvector 浮点运算 + `round()` + `json.dumps` 的路径都会触发此 bug。

## 传播路径

```
pgvector centroid_embedding (numpy.float32 元素)
  → _cosine_distance: sum(x*y) → dot 是 numpy.float32
    → 1.0 - dot/(norm_a*norm_b) → numpy.float32
      → round(numpy.float32, 4) → 仍然是 numpy.float32
        → json.dumps(routing_event) → 💥 崩溃
```

同样的问题也存在于 `retrieval_service.py` 的 similarity 计算路径。

## 修复

纵深防御三层（commit `df9c55c` 之后的新修复）：

| 层 | 文件 | 改动 |
|----|------|------|
| 源头 | `kb_router.py:_cosine_distance` | `return float(1.0 - dot / ...)` |
| 防御 | `kb_router.py:match_kb_by_centroid` | `float(round(first_dist, 4))` |
| 防御 | `retrieval_service.py:_pgvector_search` | `float(round(row.similarity, 4))` |
| 防御 | `chat_service.py:307,321` | `float(round(c.similarity, 4))` |
| 兜底 | `chat_service.py:_push_thinking` | `_SafeJsonEncoder` — 检测 `hasattr(o, "item")` → `float(o.item())` |

## 防范

新增代码中，任何来自 pgvector 的浮点值在 `round()` 或 `json.dumps()` 之前，必须显式 `float()` 归一化。
