---
# hand-sim-4ecs
title: 'Refactor-B.2: Ordered ENGAGE Activation With Safe Switch Failure'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-19T15:01:01Z
updated_at: 2026-09-19T16:51:35Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-bb9l
---

## Parent

hand-sim-wt44

## What to build

A Gateway handshake engages the arm in strict order — activate controllers, then subscribe joints, then home — so a rejected controller switch leaves the arm parked instead of streaming with nowhere to go, and each step is logged.

## Acceptance criteria

- [ ] ENGAGE with controller switch unavailable keeps the arm parked with no joint subscription and no homing thread, plus a standby error published
- [ ] ENGAGE with switch accepted reaches ready via the existing homing path
- [ ] Handshake tests extended with a fake controller-switch endpoint
- [ ] Each activation step logged

## Blocked by

- hand-sim-bb9l (Refactor-B.1)

## Summary of Changes

Ordered ENGAGE activation in EdgeBridgeNode.handle_engage (commit 6b39012):
- Strict order: (1) switch_controller activate both controllers, (2) lazy joint subscription, (3) homing via existing path.
- Switch rejected/unavailable aborts parked: state back to STANDBY, no joint sub, no homing thread, SWITCH_CONTROLLER_FAILED error frame + per-step info/warning logs.
- close() now destroys switch client.
- Tests: extended handshake suite with fake SwitchController endpoint (unavailable/rejected stay parked with error; accepted reaches IDLE); poses/actions suites updated with fake switch servers; new conftest.make_switch_server fixture.
- Verify: 34 passed (handshake 7 + poses 8 + actions 8 + arm_controller rest).
