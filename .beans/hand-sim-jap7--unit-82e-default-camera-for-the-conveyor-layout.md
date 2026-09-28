---
# hand-sim-jap7
title: 'Unit 8.2e: Default camera for the conveyor layout'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:04Z
updated_at: 2026-09-28T16:06:04Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-wie8
    - hand-sim-323x
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

Choose a default camera on the robot's right side (start REP (0.2, −1.9, 1.4) → target (0.1, 0, 0.1)) that shows belt, arm and RearStand together. Compare 3–4 candidates by Playwright screenshot and lock the winner.

## Acceptance criteria

- [ ] 3–4 candidate screenshots produced and compared
- [ ] Chosen default shows hopper, PickZone, bin and all three towers unobstructed at HOME
- [ ] Test locks the default camera pose
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-wie8 (02)
- hand-sim-323x (03)

Spec + decision log: `support_files/specs/unit8/`.
