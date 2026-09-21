---
# hand-sim-3q1f
title: 'Unit 6.6.2: Workpiece survives until grasp'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:18Z
updated_at: 2026-09-21T11:43:24Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-5ije
---

## Parent

hand-sim-4814

## What to build

Table Gearwheel stays visible through EXECUTING, hides on GRASPING suction (no flange mesh shown), tower grows on RELEASING. Clear only on grasp, explicit clear, or tower deposit.

## Acceptance criteria

- [ ] click table then EXECUTING: gear still on table
- [ ] GRASPING phase: table gear hidden (sucked)
- [ ] RELEASING phase: tower count plus one

## Blocked by

- Unit 6.6.1 (gateway preserves state)

## Summary of Changes (2026-09-21)

TDD red->green. New vitest Unit 6.6.2: table gear survives EXECUTING + IDLE return until grasp, hides on GRASPING suction, tower +1 on RELEASING.

- RobotVisualizer.tsx: removed hasActiveGear===false auto-clear effect (deps now [robotState]); removed orphaned clearActiveGearRef. Table gear clears only on grasp/tower-deposit/explicit clearWorkspace.
- useTeleopSession.ts: EXECUTING->IDLE setHasActiveGear(false) now gated on actual grasp (tower count>0 or gear attached/ever-attached).
- TeleopClient.test.tsx: 2 existing tests made async + rAF flush between grasp/release telemetry so attach/deposit run before IDLE assertions.
- Verify: 175/175 web tests pass, oxlint 0, tsc clean.
