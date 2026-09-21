---
# hand-sim-1n85
title: 'unit 6.7.0 domain: workcell_state snapshot schema + regen'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:32Z
updated_at: 2026-09-21T19:50:36Z
parent: hand-sim-cf7y
---

Stage 0. Add optional workcell_state {spawned[], in_progress[], processed[] of {id,x,y,z,+origin}, active_id} to schemas/robot_telemetry_event.schema.json. SpawnObject.srv response += gear_id. NEW MarkGrasped.srv + CommitDrop.srv (empty requests, robot id-free). Run scripts/generate_domain.py (py/rs/ts lockstep). Round-trip tests incl legacy-absent valid + coord fidelity. TDD red-green.

## Summary of Changes

Required workcell_state {spawned[], in_progress[], processed[] of flat GearEntry {id,x,y,z}, active_id?} on RobotTelemetryEvent. No timestamps/origin per simplify. id minLength:1 never cut. Lockstep regen py/rs/ts. SpawnObject.srv += gear_id. New MarkGrasped.srv + CommitDrop.srv (empty requests, id-free). Edge cache+embed, throttler carry. Tests: py 17, rs 17+9+8, web 185 green. Launch 5Hz test fails pre-existing (broadcaster race, clean tree flaky) — not caused here.
