---
# hand-sim-y16q
title: 'Unit 9.27: EmergencyStop stops the arm in place and ends the session'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:39:12Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-o7w6
---

## What to build
D31: the orchestrator cancels its own PickAndPlace goal on EmergencyStop (today the arm keeps moving). The Gateway closes the WebSocket after forwarding EMERGENCY_STOP; TeleopClient returns to Connect; reconnect sends CLEAR_WORKSPACE (flush). RESET_FAULT stays for device faults.

## Acceptance criteria
- [ ] Orchestrator test: EmergencyStop mid-SortCycle cancels the arm goal
- [ ] Gateway nextest: EMERGENCY_STOP is forwarded, then the session closes and the robot slot frees
- [ ] Web unit test: close after E-stop shows Connect; reconnect sends CLEAR_WORKSPACE
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
