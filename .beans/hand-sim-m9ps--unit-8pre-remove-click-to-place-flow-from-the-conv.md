---
# hand-sim-m9ps
title: 'Unit 8.pre: Remove click-to-place flow from the conveyor branch'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-28T16:06:03Z
parent: hand-sim-d04j
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

Delete Flow A from `feat/conveyor-flow` so exactly one flow lives on the branch (ADR 0005). The app still boots, connects and renders arm, pedestal, SpindleTowers and ScrapBin — just no WorkcellTable.

## Acceptance criteria

- [ ] WorkcellTable and landing mat fixture removed from the scene
- [ ] Raycast click-to-place, reticle, reach ring and ClickLockout removed
- [ ] Flow A unit tests and Cucumber features removed; remaining suites green
- [ ] App boots, connects and renders the arm with towers and bin
- [ ] `scripts/verify.sh` prints `verify: GREEN`
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- None (can start immediately)

Spec + decision log: `support_files/specs/unit8/`.
