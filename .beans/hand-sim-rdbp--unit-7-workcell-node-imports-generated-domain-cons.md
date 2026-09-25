---
# hand-sim-rdbp
title: 'Unit 7: workcell_node imports generated domain constants'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-25T10:41:01Z
updated_at: 2026-09-25T11:14:23Z
parent: hand-sim-u2tx
---

workcell_node.py re-declares GREEN/BLUE_SPINDLE, VALID_GEAR_COLORS, DEFAULT_GEAR_COLOR locally instead of importing generated src/domain/domain.py (Stage-0 single-source-of-truth violation; web constants.ts already imports from @contracts). Import generated domain; packaging wrinkle: workcell_manager/package.xml has no domain dep and no ROS package ships src/domain — needs packaging call (vendor file or new dep), no sys.path hack. Verify: colcon build + pytest workcell, no local constant defs remain.

## Summary of Changes

- workcell_node.py imports generated domain (WHITE/GREEN/BLUE_TOWER, SCRAP_BIN, TOWER_CAPACITY, STACK_STEP_M, MAX_SCRAP_BIN_CAPACITY, VALID_GEAR_COLORS, DEFAULT_GEAR_COLOR); zero local constant defs; legacy aliases deleted, node/tests/__init__ migrated to domain names.
- Schema Stage-0 first: added MAX_SCRAP_BIN_CAPACITY + DEFAULT_GEAR_COLOR consts, tagged GearColor enums -> VALID_GEAR_COLORS; generator emits constant without redeclaring enum types/aliases (py/rs/ts dedup), raises on conflicting duplicate names.
- Stage-0 lock tests in tests/test_domain.py (constant values + no-local-defs guard).
- Verify: colcon build workcell_manager ok; 115 pytest pass (workcell+arm+domain); generate --check ok; tsc+oxlint clean; 214 vitest pass. One arm standby flake failed once, passed on rerun + full rerun green.
