---
# hand-sim-udul
title: 'ScrapBin: widen to belt width and stop showing each defective gear'
status: completed
type: bug
priority: normal
created_at: 2026-09-30T13:09:12Z
updated_at: 2026-09-30T13:24:44Z
parent: hand-sim-d04j
---

Bin footprint is 0.12 x 0.10 m; belt is 0.30 m wide (BELT_X_RANGE). Make it >= belt width (~0.34 m). Q6/Q28 agreed: bin is binary (green empty / red non-empty), no per-gear stacking, yet each defective processed entry renders as a gear in the bin (workcell books z stacked by height_step). Render no gear meshes for intact=false; keep red/green state.

Bin widened to 0.34 m (belt 0.30 m); binned defective gears get no mesh, binary green/red only. Unit + E2E green.
