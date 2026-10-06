---
# hand-sim-y16q
title: 'Unit 9.27: EmergencyStop stops the arm in place and ends the session'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T11:22:35Z
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

## Summary of Changes

- Orchestrator EmergencyStop fires FREEZE and cancels its own PickAndPlace goal (arm safe-stops in place) before queuing the FAULT transition; test asserts the cycle is cancelled, never finishes HOME, and adds no fault.
- Gateway: after forwarding EMERGENCY_STOP the session closes (reason EMERGENCY_STOP), the robot slot frees and STANDBY publishes; new nextest estop_close.rs; rate_limit test reordered so the E-stop is the last frame.
- TeleopClient: on that close it shows DISCONNECTED + a banner; Connect again sends CLEAR_WORKSPACE (flush). Reset Fault is enabled on a cell FAULT too (device faults, D20), so RESET_FAULT works without the arm faulting.
- Mock gateway/cell follow D31 (freeze in place, close, reconnect IDLE) and gain injectDeviceFault; E2E scenarios rewritten (E-stop → reconnect → empty; device fault → Reset Fault). E2E 16/16, verify: GREEN.
