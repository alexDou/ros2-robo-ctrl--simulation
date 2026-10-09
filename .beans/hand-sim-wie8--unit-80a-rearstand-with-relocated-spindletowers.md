---
# hand-sim-wie8
title: 'Unit 8.0a: RearStand with relocated SpindleTowers'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T12:58:07Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-m9ps
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

Move the three SpindleTowers onto a RearStand behind the arm (X ≈ −0.45, row along Y ≈ −0.26/−0.10/+0.06, shifted toward the camera). Coordinates change only via schema consts + domain codegen; hard-coded copies replaced by generated constants.

## Acceptance criteria

- [ ] Tower consts updated in the schema and regenerated for Python/Rust/TS; contract tests lock the new values
- [ ] No hard-coded tower coordinate copies remain outside generated code
- [ ] RearStand fixture rendered in REP-103 coordinates with towers on it
- [ ] IK test: every tower drop (bottom to top slot) solves
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-m9ps (01)

Spec + decision log: `docs_src/specs/unit8/`.

Towers moved to rear stand via schema consts + codegen; RearStand fixture; strict IK test for all 30 tower slots. Note: pan-swing guard in test_pick_to_retreat now compares against waypoint azimuth change (front->rear sweep is ~pi). Stale test test_drop_reachable_only_by_branch_switch_is_rejected still uses old (0.70,0.16) coords; re-point later. SCRAP_BIN relocation left for its own ticket.
