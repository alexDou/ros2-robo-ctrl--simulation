---
# hand-sim-ti22
title: 'Unit 7: widen click-ring reach so BLUE tower edge is spawnable'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-25T10:41:09Z
updated_at: 2026-09-25T10:52:58Z
parent: hand-sim-u2tx
---

BLUE_TOWER=(0.70,-0.30) has R~0.762 but REACHABILITY_MAX_RADIUS=0.75 in web constants.ts, so the click-reticle gate in picking.ts rejects spawn clicks on the table strip near BLUE (drops unaffected — backend routes regardless of spawn point; mat maxX 0.70 also clips it). Bump MAX_RADIUS to ~0.80 (within 0.85 IK reach per wireframe), keep MIN 0.40. Verify: vitest picking/visualizer suites green, click at BLUE-adjacent mat coords accepted.

## Summary of Changes

- REACHABILITY_MAX_RADIUS 0.75 -> 0.80 (constants.ts); BLUE R~0.762 now inside ring, still within 0.85 IK reach.
- Mat comment boundary updated to 0.80 (table.ts).
- New web/tests/unit/RobotVisualizer/reach.test.ts: mat corner + BLUE XY accepted, max radius covers 0.762.
- Verify: 214 vitest pass, oxlint clean, tsc clean.
