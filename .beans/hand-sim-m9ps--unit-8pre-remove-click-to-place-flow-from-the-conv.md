---
# hand-sim-m9ps
title: 'Unit 8.pre: Remove click-to-place flow from the conveyor branch'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T12:46:44Z
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

Spec + decision log: `docs_src/specs/unit8/`.

Web-side Flow A removed. Deferred: gateway QcClassifier + mock SPAWN_OBJECT path (Unit 8.0 schema work); palm-grasp closed_loop E2E dropped (needs spawn; re-cover in Unit 8 E2E). clearWorkspace no longer gated on session hasActiveGear (flag never set now).
