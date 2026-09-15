---
# hand-sim-lg8q
title: 'Unit 5.5: Multi-Service System Integration Suite'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:28Z
updated_at: 2026-09-15T22:29:30Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-366j
    - hand-sim-24sn
    - hand-sim-wqyv
    - hand-sim-3hb6
---

## Parent
hand-sim-7w33

## What to build
Multi-service automated end-to-end integration test suite orchestrating EdgeNode, Gateway, and TeleopClient to verify the complete click-to-place gear ingestion, reachability targeting, command propagation, lockout enforcement, and workspace clearing lifecycle.

## Acceptance criteria
- [ ] Automated Playwright / Cucumber test launches EdgeNode, Gateway, and TeleopClient
- [ ] Valid click on WorkcellTable renders gearwheel in 3D scene and dispatches SPAWN_OBJECT command
- [ ] Gateway forwards command and EdgeNode WorkcellState records active gear
- [ ] UI locks out further clicks while gear is active
- [ ] Clicking 'Clear Workspace' dispatches CLEAR_WORKSPACE command, resets EdgeNode state, destroys 3D mesh, and unlocks table clicks
- [ ] Latency and state verification pass under 50ms budget

## Blocked by
- hand-sim-366j (Unit 5.1)
- hand-sim-24sn (Unit 5.2)
- hand-sim-wqyv (Unit 5.3)
- hand-sim-3hb6 (Unit 5.4)
