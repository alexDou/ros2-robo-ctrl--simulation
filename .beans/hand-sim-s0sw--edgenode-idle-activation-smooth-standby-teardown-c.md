---
# hand-sim-s0sw
title: 'Refactor-B.3: Gentle STANDBY Teardown With Park-Before-Deactivate'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-19T15:01:07Z
updated_at: 2026-09-19T17:26:45Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-4ecs
---

## Parent

hand-sim-wt44

## What to build

Gateway disconnect parks the arm gently: cancel active goals, park to home when mid-motion, then deactivate controllers and drop the joint subscription, always landing parked within a bounded time.

## Acceptance criteria

- [x] STANDBY during motion sends one home park goal before deactivation (mock trajectory endpoint observes it)
- [x] STANDBY while ready skips the park yet still deactivates and drops the subscription
- [x] STANDBY never blocks beyond a bounded time; failures are warnings and state always ends parked
- [x] Active trajectory and pick-and-place goals are cancelled first

## Blocked by

- hand-sim-4ecs (Refactor-B.2)

## Summary of Changes

Gentle STANDBY teardown in EdgeBridgeNode.handle_standby (commit 345bba8):
- Cancels active trajectory + PickAndPlace goals first.
- Parks to HOME once when prev state EXECUTING (park runs while still EXECUTING so dispatch gate passes; bounded by standby_park_timeout; stray park goal cancelled on timeout).
- Skips park while ready; drops joint sub; deactivates controllers. Failures warnings only; state always forced STANDBY last (wins over park-result IDLE flip).
- Stale-result guards in traj/PnP on_result callbacks (superseded results ignored).
- Tests: new test_edge_bridge_standby.py (4 tests: motion-parks-once, ready-skips-park, bounded-no-servers, pnp-cancel-first).
- Verify: 38 passed (arm_controller suite) + 15 passed (tests/test_domain.py).
