"""出题回流：从错题生成「补洞题」。

跑法（venv 的 Python，一次性进程）：
    <venv>\\Scripts\\python.exe app\\deep\\quiz_gen.py
stdin  JSON：{"prompt": "...", "n": 4, "model": "可选"}
stdout JSON：{"ok":true,"items":[...]} 或 {"ok":false,"error":"..."}

★不碰任何 key —— 模型配置（base URL / model / key）全部走 DeepTutor 自己的
  services.llm 配置（`data\\user\\settings\\model_catalog.json`），key 只活在
  那个文件里，不会被读出来、不会被打印、不会被写进任何日志。
"""
from __future__ import annotations

import asyncio
import json
import re
import sys


def _die(msg: str) -> None:
    sys.stdout.write(json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False))
    sys.exit(0)


def _extract(text: str) -> list:
    """模型偶尔会包一层 ```json 或前后加话，把里面的 JSON 数组抠出来。"""
    if not text:
        return []
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", t, re.S)
    if m:
        t = m.group(1)
    else:
        i, j = t.find("["), t.rfind("]")
        if i >= 0 and j > i:
            t = t[i:j + 1]
    try:
        v = json.loads(t)
    except Exception:
        return []
    return v if isinstance(v, list) else []


def _clean(items: list, n: int) -> list:
    """只留结构完整的题 —— 少一个字段就整题丢掉，宁缺毋滥。"""
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        q = str(it.get("q") or "").strip()
        opts = it.get("opts")
        e = str(it.get("e") or "").strip()
        if not q or not isinstance(opts, list) or len(opts) < 4 or not e:
            continue
        opts = [str(o).strip() for o in opts[:4]]
        if any(not o for o in opts):
            continue
        a = it.get("a")
        if isinstance(a, str):
            a = "ABCD".find(a.strip().upper()[:1]) if a.strip() else -1
        if not isinstance(a, int) or a < 0 or a > 3:
            continue
        out.append({
            "q": q,
            "opts": opts,
            "a": a,
            "e": e,
            "kd": str(it.get("kd") or "").strip()[:40],
            "tip": str(it.get("tip") or "").strip()[:120],
        })
        if len(out) >= n:
            break
    return out


async def _run(payload: dict) -> dict:
    from deeptutor.services.llm import complete  # 延迟到用时才 import

    prompt = str(payload.get("prompt") or "").strip()
    n = max(1, min(12, int(payload.get("n") or 4)))
    if not prompt:
        return {"ok": False, "error": "prompt 为空"}

    # ★必须走 services.llm.complete(prompt=..., system_prompt=...)。
    #   以前用 get_llm_client().complete(messages=[{role:'user',content:...}])
    #   会拿到 DeepSeek 的 `messages[1]: missing field 'type'` —— 那条路的消息体
    #   形状跟 provider 期望的对不上。complete() 是 DeepTutor 自己在用的那条。
    kwargs = {}
    if payload.get("model"):
        kwargs["model"] = payload["model"]
    text = await complete(
        prompt=prompt,
        system_prompt=(
            "你是资深的公考（行测）出题人，出的题跟真题一个路数。"
            "严格按用户要求输出 JSON 数组，不要任何多余文字。"
        ),
        temperature=0.7,
        **kwargs,
    )
    if not isinstance(text, str):
        text = getattr(text, "content", None) or getattr(text, "text", None) or ""

    items = _clean(_extract(text), n)
    return {"ok": bool(items), "items": items, "raw_len": len(text or "")}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        _die("stdin 不是合法 JSON：%s" % exc)
    try:
        out = asyncio.run(_run(payload))
    except Exception as exc:  # 配置没配好 / 网络不通 / 模型拒答 —— 都回人话
        out = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    sys.stdout.write(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
