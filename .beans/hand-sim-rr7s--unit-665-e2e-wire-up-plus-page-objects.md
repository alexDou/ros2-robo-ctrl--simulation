---
# hand-sim-rr7s
title: 'Unit 6.6.5: E2E wire-up plus page objects'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:40Z
updated_at: 2026-10-06T10:39:12Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-he7j
    - hand-sim-92ew
    - hand-sim-dnv4
---

## Parent

hand-sim-4814

## What to build

Click-to-stack times two cycles green in real processes. Stale locators (pose-ready/inspect, palm, estop) updated. No flicker, tower grows.

## Acceptance criteria

- [ ] automated PNP times 2: tower grows 1 then 2
- [ ] TeleopPage locators match new toolbar (no ready/inspect, palm, estop)
- [ ] unit plus e2e suites green

## Blocked by

- hand-sim-he7j (Unit 6.6.3)
- hand-sim-92ew (Unit 6.6.4a)
- hand-sim-dnv4 (Unit 6.6.4b)

Verified 2026-10-06: original wording superseded by Unit 6.7 (snapshot is source of truth) and Units 8/9 (Fill/Process, browser sends intents only). Removed E2E scenarios 8.1a/8.1b and the 'joint positions unchanged' assertion; EmergencyStop scenario now does E-stop -> Reset Fault -> empty. Unit coverage: tower_buckets (flange ride), tower_disposal (tower grows only from processed echo). E2E 16/16 green.

## Review note 2026-10-06

The original ACs (automated PNP ×2, tower grows 1 then 2) belong to the retired click-to-pick flow. Their observable intent (count growing per drop, flange ride) is carried by hand-sim-j75k and the RobotVisualizer unit tests.
