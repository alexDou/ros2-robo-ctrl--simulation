---
# hand-sim-zzvr
title: 'Unit 8.1a: Defective gear booked to ScrapBin without arm motion; binary bin'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T13:49:41Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-rmju
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

A spawned `intact == false` gear is committed straight to ScrapBin inventory by WorkcellNode; the arm is not commanded and the gear stays on the belt visually. ScrapBin moves under the belt exit (Y ≈ −0.75) and renders green when empty, red when non-empty; it empties at 100.

## Acceptance criteria

- [ ] pytest: defective spawn → bin inventory, no pending pick
- [ ] pytest: bin empties at MAX_SCRAP_BIN_CAPACITY (100)
- [ ] SCRAP_BIN const relocated via schema + codegen
- [ ] Controller sends no pick for a defective gear
- [ ] Bin renders green at 0, red at ≥1 (Vitest)
- [ ] E2E: defective gear turns the bin red with no arm motion
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-rmju (04)

Spec + decision log: `support_files/specs/unit8/`.

Done, verify GREEN. Deferred to 8.2: defective gear stays visually on the belt (snapshot renders it in the bin for now). ScrapBin moved to [0.4,-0.75,-0.05]; SCRAP reach case dropped from test_kinematics (arm no longer visits the bin).
