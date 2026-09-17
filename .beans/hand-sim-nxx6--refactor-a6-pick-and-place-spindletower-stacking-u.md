---
# hand-sim-nxx6
title: 'Refactor-A.6: Pick-and-Place & SpindleTower Stacking UI E2E Feature'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T22:28:57Z
updated_at: 2026-09-17T22:28:57Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-yopr
---

## Parent

hand-sim-wt44

## What to build

Add automated UI E2E feature and step definitions for autonomous pick-and-place and SpindleTower stacking against MockGateway. Operator clicks reachable table coordinate -> dispatches PICK_AND_PLACE_TARGET -> MockGateway streams 10-step Action feedback phases (APPROACHING to HOMING) -> progress bar updates in UI -> gear mesh attaches to tool flange on GRASP -> gear unparents and stacks on SpindleTower post -> manipulator returns HOME -> IDLE restored -> ClickLockout lifts -> second click stacks second gear on tower.

## Acceptance criteria

- [ ] MockGateway simulates 10-step Action feedback phases and waypoint trajectory progression for PICK_AND_PLACE_TARGET
- [ ] Gherkin feature web/tests/e2e/features/pick_and_place.feature defines pick-and-place closed loop and multi-gear stacking scenarios
- [ ] Step definitions in web/tests/e2e/steps/pick_and_place.steps.ts assert Action progress bar, flange attachment, SpindleTower stacking height, and ClickLockout lifecycle
- [ ] Multi-gear stacking scenario verifies subsequent clicks stack gears with 2cm vertical increment on SpindleTower
- [ ] All E2E scenarios pass cleanly in headless Playwright/Cucumber

## Blocked by

- hand-sim-yopr (Refactor-A.5)
