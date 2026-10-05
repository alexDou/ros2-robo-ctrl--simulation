---
# hand-sim-d9jd
title: Deflake load-sensitive tests, STANDBY late-accept race
status: completed
type: bug
created_at: 2026-10-05T18:41:47Z
updated_at: 2026-10-05T18:41:47Z
---

STANDBY snapshotted active goal handles, but a goal accepted after that was adopted as active while STANDBY parked home, so it was never cancelled (found by test_edge_bridge_standby under CPU load). Fix: goal epoch bumped by STANDBY; late accepts are cancelled (deterministic test_edge_bridge_standby_race). Also: validation test uses an unserved action name; kinematics benchmark takes best-of-batches; throttler 500 Hz rate tests use tokio's paused clock (exactly 30.00 Hz, 2.4 s -> 0.08 s). Verified with 8 busy loops on 8 cores and 4 consecutive green verify runs.
