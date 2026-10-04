---
# hand-sim-280q
title: 'Unit 9.03: cell controller seam skeleton (FieldIoPort, Modbus TCP, virtual_plc)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-r966
---

## What to build

New ROS2 Python package for the cell devices. A FieldIoPort with one Modbus TCP adapter (pymodbus), a versioned register-map constant table shared by device nodes and virtual_plc, and a virtual_plc node serving that map. Launch argument (controller host/port + virtual_plc on/off) beside use_fake_hardware. Prerequisite: the user installs python3-pymodbus (apt).

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Round-trip test: adapter writes a command word + sequence, virtual_plc echoes ack_seq
- [ ] Tests run against an in-process Modbus server (hermetic)
- [ ] Launch starts virtual_plc only in SIM
- [ ] verify: GREEN

## Blocked by

- hand-sim-r966 (01)
