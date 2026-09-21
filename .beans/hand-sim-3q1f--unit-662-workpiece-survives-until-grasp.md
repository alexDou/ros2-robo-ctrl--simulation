---
# hand-sim-3q1f
title: 'Unit 6.6.2: Workpiece survives until grasp'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:18Z
updated_at: 2026-09-21T10:47:17Z
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
