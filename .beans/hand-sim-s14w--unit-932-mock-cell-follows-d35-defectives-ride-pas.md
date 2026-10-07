---
# hand-sim-s14w
title: 'Unit 9.32: Mock cell follows D35 (defectives ride past the eye)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-07T16:42:28Z
updated_at: 2026-10-07T19:38:01Z
parent: hand-sim-rqpy
---

## Goal
Make the web E2E mock cell (`web/tests/e2e/support/mock_cell.ts`) follow D35 so mocked runs look like SIM runs. Today it stops the belt when the lead **unsorted** gear (intact or defective) reaches the PickZone edge (`step()`, the `this.unsorted[0]` check). Defectives join the Batch and are moved to `carried` by `takeNext()`.

## Target behaviour (D35)
- Only an intact gear stops a feed run at the PickZone edge. Defectives are never in a Batch: they ride on and fall off the belt end, which raises SCRAP by 1 and emits the `scrapped` event, on any run including the first.
- Every run carries the next intact gear the full way to the edge.
- The final flush still runs out whatever is left.

## Notes
- The E2E boundary: the mock stands in for everything behind TeleopClient (CLAUDE.md). This is purely a web-side fidelity fix, not a check on the PLC.
- Tests: add a mock unit test in `web/tests/unit/mockGateway.test.ts` (or a mock_cell test) for the first-run defective falling into the bin, red first. Then run `npm --prefix web run test:e2e` and fix any scenario whose counts assumed the old rule (closed_loop.feature: panel/counters and bin exchange scenarios).
- Verify: `scripts/verify.sh` must print GREEN.


## Note 2026-10-07 (session 2)
Do it after hand-sim-w9st: the 4jbb stash already changes web/tests/e2e/support/mock_gateway.ts (pocket drops), and mock_cell.ts sits beside it. Apply the stash first so the edits don't conflict.
