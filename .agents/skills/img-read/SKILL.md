---
name: "img-read"
description: "Ask vision questions about screenshots/sim frames via OpenRouter free vision models (imgask)."
triggers:
  - "*.png"
  - "*.jpg"
  - "screenshot"
  - "imgask"
---

# Img-Read

Operational boundary: turn image pixels into quoted text answers via `scripts/imgask.py`. Never claim to see images directly.

## Pipeline

```
image file → scripts/imgask.py "<question>" → quoted text answer → act on text
```

## Canonical pattern

```bash
OPENROUTER_API_KEY=... python3 scripts/imgask.py \
  "/home/ros2/Pictures/Screenshots/shot.png" \
  "Where is the gripper reticle relative to the gear? One sentence."
```

## Hard invariants

- `OPENROUTER_API_KEY` from env only. Never log, print, or commit it.
- Images >2MB auto-downscaled (PIL path); tiny 283px shots sent as-is.
- Quote vision answer verbatim before acting on it; never paraphrase into coordinates.
- Sim UI screenshots only — no secrets in frame (images leave machine to cloud).

## Common failure modes

- `RuntimeError: OPENROUTER_API_KEY missing` → export key first.
- `401` → key invalid/revoked; re-check env.
- `429` rate-limit → retry with `--model <other-free-vision-model>`.
- `413` payload too large → downscale image, retry.
