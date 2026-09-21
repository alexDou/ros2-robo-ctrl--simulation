---
# hand-sim-c7kb
title: 'Unit 6.6.6: Visible flange ride, tower grows only at release'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-21T13:22:24Z
updated_at: 2026-09-21T13:22:24Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-he7j
---

## Parent

hand-sim-4814

## What to build

Gear rides flange visibly from GRASP to RELEASE. Tower grows only at RELEASING.

Bug (user-verified 2026-09-21, commit 6d71360 did NOT fix): gear disappears from table on palm suck (GRASPING) but appears immediately in tower stack. Expected: gear stays attached to arm device through LIFT/TRANSFER/DROP path, tower +1 only after arm executes path to tower and releases gear.

Evidence: gear-trip video f_019 grasps, f_020 gear already in tower (0.5s apart, no transit). Pre-Connect idle correct (no telemetry, gear on table). First connected frame f_010.

Suspects: rendered FK pose lags real nozzle so attach misplaces gear inside palm mesh (invisible ride); Case 2 release fires early on grasp-bit flicker; depositPendingGear IDLE path still deposits.

## Acceptance criteria

[ ] GRASPING: table gear empties, gear visibly attached to flange/palm through transfer
[ ] LIFT/TRANSFER/DROP window: tower count stays 0 while grasp held
[ ] RELEASING at tower: tower count +1 at z_k=k*0.02m
[ ] second cycle: tower count 2, lockout lifted between cycles

## Blocked by

- hand-sim-he7j (Unit 6.6.3)
