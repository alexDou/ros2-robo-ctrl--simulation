#!/usr/bin/env python3
"""Ask a vision question about an image via OpenRouter free models.

Usage: imgask.py <image-path> "<question>" [--model X] [--max-tokens N]
Env: OPENROUTER_API_KEY required. IMGASK_MODEL overrides default.
"""
from __future__ import annotations
import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.request

DEFAULT_MODEL = os.environ.get(
    "IMGASK_MODEL", "deepseek/deepseek-v4-flash-vision-exp")
API_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_BYTES = 2_000_000


def get_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY missing from env")
    return key


def load_bytes(path: str) -> tuple[bytes, str]:
    with open(path, "rb") as f:
        raw = f.read()
    mime, _ = mimetypes.guess_type(path)
    if mime is None:
        mime = "image/png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    if len(raw) > MAX_BYTES:
        try:
            from PIL import Image
            import io
            im = Image.open(path)
            im.thumbnail((1280, 1280))
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            return buf.getvalue(), "image/png"
        except ImportError:
            pass
    return raw, mime


def build_payload(raw: bytes, mime: str, question: str, model: str) -> dict:
    b64 = base64.b64encode(raw).decode()
    return {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": question},
            {"type": "image_url",
             "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ]}],
    }


def ask(raw: bytes, mime: str, question: str, model: str,
        max_tokens: int = 1500) -> str:
    body = build_payload(raw, mime, question, model)
    body["max_tokens"] = max_tokens
    req = urllib.request.Request(
        API_URL, data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {get_key()}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as fp:
        resp = json.load(fp)
    msg = resp["choices"][0]["message"]
    content = msg.get("content")
    if isinstance(content, str) and content.strip():
        return content
    # Reasoning models (deepseek-v4-flash-vision-exp) may return content=None
    # with finish_reason='length' when max_tokens caps reasoning. Fall back
    # to reasoning text so callers still get signal; retry with bigger budget.
    reasoning = msg.get("reasoning") or ""
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning
    details = msg.get("reasoning_details") or []
    texts = [d.get("text", "") for d in details if isinstance(d, dict)]
    joined = "\n".join(t for t in texts if t).strip()
    if joined:
        return joined
    return repr(msg)[:500]


def ask_file(path: str, question: str, model: str = DEFAULT_MODEL,
             max_tokens: int = 500) -> str:
    raw, mime = load_bytes(path)
    return ask(raw, mime, question, model, max_tokens)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image")
    ap.add_argument("question")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--max-tokens", type=int, default=1500)
    args = ap.parse_args(argv)
    try:
        print(ask_file(args.image, args.question, args.model,
                       args.max_tokens))
    except RuntimeError as e:
        print(f"imgask: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
