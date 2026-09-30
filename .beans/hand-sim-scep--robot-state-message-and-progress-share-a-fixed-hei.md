---
# hand-sim-scep
title: Robot-state message and progress share a fixed-height row above the workspace
status: completed
type: task
created_at: 2026-09-30T11:11:54Z
updated_at: 2026-09-30T11:11:54Z
parent: hand-sim-d04j
---

Moves 'Robot EXECUTING: actions resume when IDLE' out of the toolbar into ActionStatusRow (left) with the action progress bar (right), fixed 2.75rem height so the layout never shifts between gears. Also fixes the stale dynamic_motion E2E sync assertion (canvas lerp lags raw sidebar while moving).
