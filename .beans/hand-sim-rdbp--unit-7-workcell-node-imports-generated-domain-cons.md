---
# hand-sim-rdbp
title: 'Unit 7: workcell_node imports generated domain constants'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-25T10:41:01Z
updated_at: 2026-09-25T10:41:15Z
parent: hand-sim-u2tx
---

workcell_node.py re-declares GREEN/BLUE_SPINDLE, VALID_GEAR_COLORS, DEFAULT_GEAR_COLOR locally instead of importing generated src/domain/domain.py (Stage-0 single-source-of-truth violation; web constants.ts already imports from @contracts). Import generated domain; packaging wrinkle: workcell_manager/package.xml has no domain dep and no ROS package ships src/domain — needs packaging call (vendor file or new dep), no sys.path hack. Verify: colcon build + pytest workcell, no local constant defs remain.
