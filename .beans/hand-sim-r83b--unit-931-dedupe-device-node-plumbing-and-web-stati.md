---
# hand-sim-r83b
title: 'Unit 9.31: dedupe device-node plumbing and web station motion; panel shows cell_state counts'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:57Z
updated_at: 2026-10-06T10:38:57Z
parent: hand-sim-rqpy
---

## What to build
Review smells: shared connection/poll helper for conveyor, flexfeeder and station nodes; one station-motion helper for binMotion/palletMotion (ease, leg, HOME/LEAVING/AWAY/RETURNING); one empty-payload command factory in web/domain/parsers.ts. D34: panel bin count comes straight from cell_state (towerCounts no longer adds Flow A defectives).

## Acceptance criteria
- [ ] No duplicated connection/poll loop across device nodes
- [ ] binMotion and palletMotion share one motion module
- [ ] Panel ScrapBin count equals cell_state SCRAP count (unit test)
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
