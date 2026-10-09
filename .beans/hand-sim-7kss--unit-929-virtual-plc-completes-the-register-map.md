---
# hand-sim-7kss
title: 'Unit 9.29: virtual_plc completes the register map'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T13:32:57Z
parent: hand-sim-rqpy
---

## What to build
Implement the parts of the locked register map that are missing: interlocks bitfield (bin_home, feeder_ok, drives_ok, estop_chain_ok), cell FAULT_ACK, the Pallet stop gate (held unless EXCHANGE), and fault injection for the FlexFeeder and the belt drive. Device nodes report the new faults so they reach FAULT + DEVICE_FAULT.

## Acceptance criteria
- [ ] Each register-map entry has a test against virtual_plc over Modbus
- [ ] Injected feeder and drive faults end in cell FAULT naming the device
- [ ] FAULT_ACK is used by the flush reset after a device fault
- [ ] verify: GREEN

Spec + binding decision log: docs_src/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.

## Summary of Changes

- virtual_plc: interlocks word (bin_home, feeder_ok, drives_ok, estop_chain_ok; register_map.Interlock), belt_fault/feeder_fault published, FAULT_ACK (belt and feeder clear, a faulted station drives back HOME), SIM seams inject_drive_fault / inject_feeder_fault / set_estop_chain / repair_station_sensor. Pallet stop gate: implicit in the station machine (leaves only on EXCHANGE); tested over Modbus.
- Devices: conveyor/status carries belt_fault and named interlocks; feeder/status carries its fault; new CellFaultAck.srv → cell/fault_ack on ConveyorNode, answers once no device is in FAULT and every station is HOME.
- Orchestrator: edge-triggered faults from status (DRIVE_FAULT_n, FEEDER_FAULT_n, ESTOP_CHAIN_OPEN), also while idle. Flush reset gains STOP → RECOVER (release + FAULT_ACK) → DRAIN.
- Bug fixed on the way: reset after an EmergencyStop during an exchange deadlocked (DRAIN waited for an exchange the freeze held; release came only after DRAIN). Regression test added.
- Tests: 8 PLC, 1 node, 6 orchestrator. Spec register-map rules updated. verify: GREEN.
