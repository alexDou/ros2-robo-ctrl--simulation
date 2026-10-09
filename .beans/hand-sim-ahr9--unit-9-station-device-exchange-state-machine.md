---
# hand-sim-ahr9
title: 'Unit 9.14: station device (exchange state machine)'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-05T16:18:31Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-280q
---

## What to build

virtual_plc station blocks (WHITE, GREEN, BLUE lanes; SCRAP slide+tipper) with nominal durations (PalletExchange ≈ 6 s, BinExchange ≈ 8 s) and end-sensor timeouts. Station device node (one node type, four instances by parameter) with an exchange action: HOME → LEAVING → AWAY → RETURNING → HOME, timeout → FAULT.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: full exchange sequence, feedback states
- [ ] Missing end sensor → FAULT after timeout
- [ ] verify: GREEN

## Blocked by

- hand-sim-280q (03)

Done: StationSim (HOME/LEAVING/AWAY/RETURNING/FAULT, 6 s pallet / 8 s bin, end-sensor timeout), virtual_plc station blocks, StationDevice, station_node (station param), StationExchange action. FAULT latches; FAULT_ACK recovery and the bin_home interlock bit are not implemented (not in this ticket).
