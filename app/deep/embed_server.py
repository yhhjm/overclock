"""超频 · 本地语义检索服务（OpenAI 兼容 /v1/embeddings）

为什么需要它：DeepTutor 的知识库（llamaindex 引擎）靠 embedding 做语义检索，
而它只认 HTTP 上的 OpenAI 兼容接口。这台机器上没有 Ollama、也没有云端
embedding 的 key，所以这里用 fastembed（ONNX，纯 CPU，不用 torch）把
BAAI/bge-small-zh-v1.5 跑成一个本地小服务，端口默认 5399。

* 全程离线：模型下好之后不再联网。
* 只依赖 fastembed + numpy + uvicorn（都装在 DeepTutor 的 venv 里）。
* 启动：venv\Scripts\python.exe embed_server.py --port 5399 --cache <模型目录>

接口：
  POST /v1/embeddings  {"model":"...","input":"文本" | ["文本", ...]}
                       -> {"object":"list","data":[{"object":"embedding","index":i,"embedding":[...]}], ...}
  GET  /v1/models      -> 模型清单（写死一个名字 + 别名）
  GET  /health         -> {"ok":true,"model":...,"dim":512,"loaded":true/false}
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from typing import Any

DEFAULT_MODEL = "BAAI/bge-small-zh-v1.5"
ALIASES = {DEFAULT_MODEL, "bge-small-zh-v1.5", "bge-small-zh", "text-embedding-3-small", "stub-embed-256"}

_state: dict[str, Any] = {"model": None, "dim": 0, "error": "", "cache": "", "name": DEFAULT_MODEL}
_lock = threading.Lock()


def _cache_dir(explicit: str) -> str:
    if explicit:
        return explicit
    env = os.environ.get("XCTERM_EMBED_CACHE")
    if env:
        return env
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def load_model(cache: str, name: str = DEFAULT_MODEL) -> None:
    """把模型加载进内存（第一次会从镜像下 ~95MB，之后就纯本地）。"""
    with _lock:
        if _state["model"] is not None:
            return
        os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")  # 国内可达的 HF 镜像
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        from fastembed import TextEmbedding

        _state["cache"] = cache
        _state["name"] = name
        _state["model"] = TextEmbedding(model_name=name, cache_dir=cache)
        vec = next(iter(_state["model"].embed(["测试"])))
        _state["dim"] = int(len(vec))
        print("[embed] 模型就绪：%s · %d 维 · 缓存 %s" % (name, _state["dim"], cache), flush=True)


def embed(texts: list[str]) -> list[list[float]]:
    m = _state["model"]
    if m is None:
        raise RuntimeError("模型还没加载好")
    out = []
    for v in m.embed(texts):
        out.append([float(x) for x in v])
    return out


def build_app():
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse

    # 本文件有 from __future__ import annotations，注解是字符串；Request 是局部
    # 导入的，FastAPI 解析不到就会把 req 当成 query 参数（422）。塞进模块全局即可。
    globals()["Request"] = Request

    app = FastAPI(title="超频本地语义检索", version="1.0")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    @app.get("/health")
    async def health():
        return {
            "ok": _state["model"] is not None,
            "model": _state["name"],
            "dim": _state["dim"],
            "loaded": _state["model"] is not None,
            "error": _state["error"],
        }

    @app.get("/v1/models")
    async def models():
        now = int(time.time())
        return {
            "object": "list",
            "data": [
                {"id": DEFAULT_MODEL, "object": "model", "created": now, "owned_by": "overclock"},
                {"id": "bge-small-zh", "object": "model", "created": now, "owned_by": "overclock"},
            ],
        }

    @app.post("/v1/embeddings")
    async def embeddings(req: Request):
        try:
            body = await req.json()
        except Exception:
            return JSONResponse({"error": {"message": "bad json"}}, status_code=400)
        raw = body.get("input")
        if isinstance(raw, str):
            texts = [raw]
        elif isinstance(raw, list):
            texts = [t if isinstance(t, str) else str(t) for t in raw]
        else:
            return JSONResponse({"error": {"message": "input must be string or list"}}, status_code=400)
        if not texts:
            texts = [""]
        if _state["model"] is None:
            try:
                load_model(_state["cache"] or _cache_dir(""), _state["name"])
            except Exception as exc:  # 加载失败要如实说，别返回假向量
                _state["error"] = str(exc)
                return JSONResponse(
                    {"error": {"message": "embedding model failed to load: " + str(exc)}},
                    status_code=503,
                )
        try:
            vecs = embed(texts)
        except Exception as exc:
            return JSONResponse({"error": {"message": str(exc)}}, status_code=500)
        usage = sum(len(t) for t in texts)
        return {
            "object": "list",
            "data": [
                {"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vecs)
            ],
            "model": _state["name"],
            "usage": {"prompt_tokens": usage, "total_tokens": usage},
        }

    @app.post("/v1/embeddings/")
    async def embeddings_slash(req: Request):
        return await embeddings(req)

    @app.on_event("startup")
    async def warm():
        def go():
            try:
                load_model(_cache_dir(_state["cache"]), DEFAULT_MODEL)
            except Exception as exc:
                _state["error"] = str(exc)
                print("[embed] 模型加载失败：%s" % exc, flush=True)

        threading.Thread(target=go, daemon=True).start()

    return app


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5399)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--cache", default="")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()
    _state["cache"] = _cache_dir(args.cache)
    _state["name"] = args.model
    os.makedirs(_state["cache"], exist_ok=True)
    import uvicorn

    print(
        "[embed] 起服务 %s:%d · 模型 %s · 缓存 %s" % (args.host, args.port, args.model, _state["cache"]),
        flush=True,
    )
    uvicorn.run(build_app(), host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    sys.exit(main())
