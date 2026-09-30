---
# hand-sim-thia
title: Gateway rejects back-to-back commands (RATE_LIMIT_EXCEEDED stalls conveyor run)
status: completed
type: bug
created_at: 2026-09-30T10:42:10Z
updated_at: 2026-09-30T10:42:10Z
parent: hand-sim-d04j
---

Fixed: 50 ms minimum-gap limiter replaced by a token-bucket flood ceiling (50/s, burst 20), browser->gateway only. See ADR 0004 amendment.
