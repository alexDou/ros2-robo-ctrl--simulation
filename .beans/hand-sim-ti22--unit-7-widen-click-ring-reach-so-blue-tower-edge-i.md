---
# hand-sim-ti22
title: 'Unit 7: widen click-ring reach so BLUE tower edge is spawnable'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-25T10:41:09Z
updated_at: 2026-09-25T10:41:15Z
parent: hand-sim-u2tx
---

BLUE_TOWER=(0.70,-0.30) has R~0.762 but REACHABILITY_MAX_RADIUS=0.75 in web constants.ts, so the click-reticle gate in picking.ts rejects spawn clicks on the table strip near BLUE (drops unaffected — backend routes regardless of spawn point; mat maxX 0.70 also clips it). Bump MAX_RADIUS to ~0.80 (within 0.85 IK reach per wireframe), keep MIN 0.40. Verify: vitest picking/visualizer suites green, click at BLUE-adjacent mat coords accepted.
