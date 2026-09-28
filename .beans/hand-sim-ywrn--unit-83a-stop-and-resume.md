---
# hand-sim-ywrn
title: 'Unit 8.3a: Stop and resume'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:04Z
updated_at: 2026-09-28T16:06:04Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-as72
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

UI-only Stop: belt freezes immediately, no new picks are sent, the pick already in flight completes; ConveyorStatus → STOPPED. Process resumes from the next unprocessed gear. Fill stays disabled while the hopper is non-empty. EmergencyStop unchanged.

## Acceptance criteria

- [ ] Vitest: Stop during FEEDING and HALTED; in-flight pick completes; resume continues
- [ ] No backend changes
- [ ] E2E: Stop mid-Batch, then Process finishes the run
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-as72 (08)

Spec + decision log: `support_files/specs/unit8/`.
