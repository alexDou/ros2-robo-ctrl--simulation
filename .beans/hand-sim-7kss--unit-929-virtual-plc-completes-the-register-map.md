---
# hand-sim-7kss
title: 'Unit 9.29: virtual_plc completes the register map'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:38:56Z
parent: hand-sim-rqpy
---

## What to build
Implement the parts of the locked register map that are missing: interlocks bitfield (bin_home, feeder_ok, drives_ok, estop_chain_ok), cell FAULT_ACK, the Pallet stop gate (held unless EXCHANGE), and fault injection for the FlexFeeder and the belt drive. Device nodes report the new faults so they reach FAULT + DEVICE_FAULT.

## Acceptance criteria
- [ ] Each register-map entry has a test against virtual_plc over Modbus
- [ ] Injected feeder and drive faults end in cell FAULT naming the device
- [ ] FAULT_ACK is used by the flush reset after a device fault
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
