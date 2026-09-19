---
# hand-sim-8ux1
title: 'Refactor-B.4: Gateway Handshake Retry With Guaranteed STANDBY on Disconnect'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-19T15:01:14Z
updated_at: 2026-09-19T16:18:30Z
parent: hand-sim-wt44
---

## Parent

hand-sim-wt44

## What to build

The Gateway handshake survives a slow EdgeBridge: the handshake is retried until the arm leaves parked state, and every session end publishes a standby exactly once, without changing single-session or rate-limit behavior.

## Acceptance criteria

- [ ] Gateway test extended: a dropped first handshake triggers a retry
- [ ] Disconnect publishes standby exactly once
- [ ] Single-session conflict and command rate limit behavior unchanged
- [ ] Retry bounded (a few attempts over a few seconds) with logged results

## Blocked by

None (can start immediately)
