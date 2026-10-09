---
# hand-sim-k9xh
title: 'Unit 9.24: ROS launch test of the full SIM graph'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-06T16:17:33Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-145j
    - hand-sim-cy70
    - hand-sim-3gqm
    - hand-sim-7kss
---

## What to build

Launch test with virtual_plc: Fill → Process → at least one PalletExchange per colour → BinExchange over two decks → reset to EMPTY. Proves the real ROS wiring end to end.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Launch test green in CI time budget
- [ ] verify: GREEN

## Blocked by

- hand-sim-145j (21)

## Summary of Changes

src/ros2/robot_bringup/test/test_cell_flow_launch.py: launches robot_nodes.launch.py for real (virtual_plc, sim_time_scale 40, device_poll_hz 50, arm_step_duration 0.02), engages the controllers, Fill → Process twice, asserts every Pallet (each reaches 10) and the ScrapBin (≥20) exchange and return, no cell faults, then reset → EMPTY with all counts 0. Green in 452 s. Not in verify (too slow); run with launch_test or colcon test.
Bugs it found and fixed: a stalled/sped-up PLC tick let items jump past the eye (now scans ≤20 ms); a feed run sent on a stale feeder 'remaining' ran forever (an EMPTY feeder now ends the run like FINISH_RUN); the Batch is registered at the stopped encoder position and includes the lead braked past the zone edge. New launch args: sim_time_scale, device_poll_hz, arm_step_duration (defaults unchanged).
