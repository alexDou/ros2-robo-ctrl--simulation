---
# hand-sim-kkwu
title: 'Unit 9.04: Conveyor device in SIM (eye stop, encoder, exit counter)'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T20:47:47Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-280q
---

## What to build

virtual_plc Conveyor block: belt motion with drive-style ramps, 32-bit encoder, PickZone eye stop as controller-local logic, latched exit-eye counter, HELD_BIN_AWAY refusal when the SCRAP station is not HOME. Conveyor device node: run-to-PickZone / flush / stop action + service, 5 Hz status poll, stop reason reported.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Belt stops at the eye by controller logic, not by a ROS poll
- [ ] Exit counts are never lost across slow polls (latched + sequence)
- [ ] Belt refuses RUN/FLUSH while SCRAP not HOME
- [ ] verify: GREEN

## Blocked by

- hand-sim-280q (03)

Added belt_sim (ramps, 32-bit encoder, eye stop, latched 16-bit exit counter, HELD_BIN_AWAY), virtual_plc Conveyor block with seq-gated commands, ConveyorDevice, conveyor_node (ConveyorRun action + ConveyorStop service + conveyor/status JSON), interfaces in robot_control_interfaces. Items enter the belt via VirtualPlcServer.add_belt_item (FlexFeeder 9.07 seam). Launch wiring of conveyor_node deferred to the orchestrator tickets.
