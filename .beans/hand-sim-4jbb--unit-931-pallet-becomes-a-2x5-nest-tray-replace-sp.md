---
# hand-sim-4jbb
title: 'Unit 9.31: Pallet becomes a 2x5 nest tray (replace SpindleTower rods)'
status: todo
type: task
priority: high
tags:
    - ready-for-agent
created_at: 2026-10-07T16:42:28Z
updated_at: 2026-10-07T16:42:28Z
parent: hand-sim-rqpy
---

## Goal
Replace the single-rod Pallet (SpindleTower geometry) with a **2 × 5 nest tray Pallet** (D38 in `support_files/specs/unit9/implementation_wireframe.md`; CONTEXT.md "Pallet"). Read D35–D38 first; they are binding.

## Why
The 0.20 m rods are obstacles the arm has to clear on every transfer. D37 had to raise the travel height to 0.25 m, release the gear on the rod tip, and lift the approach to 0.15 m. Even so, the planner sits at the edge of reach at the far PickZone corner (see "Current state"). Real cells put finished gears into nest trays.

## Current state (commit after hand-sim-0k5y)
- Planner `src/ros2/arm_controller/arm_controller/kinematics/trajectory.py`: approach/lift at `APPROACH_LIFT_OFFSET_M` = 0.15. Transfer/retreat at `TRANSFER_HEIGHT_M` = pin 0.20 + gear 0.02 + 0.03. Release at `RELEASE_HEIGHT_M` (pin tip). Constants are in `kinematics/constants.py`.
- Regression test `test_transfer_never_strikes_a_pin` (`src/ros2/arm_controller/test/test_kinematics.py`) samples every joint segment HOME→HOME against the pins: wrist links, tool and carried gear. It covers only the real pick band: belt centre ±30 mm, y from the PickZone low edge −0.045 (lead braked past the eye) up to the high edge.
- The tower constants are generated: `WHITE_TOWER`/`GREEN_TOWER`/`BLUE_TOWER`/`STACK_STEP_M` in `schemas/robot_telemetry_event.schema.json`. Never hand-edit `src/domain/domain.*` or `web/domain/contracts.ts`; run `python3 scripts/generate_domain.py`.

## Work (contract-first, TDD)
1. **Schema/constants**: add the tray geometry (`PALLET_POCKET_ROWS`=5, `_COLS`=2, `PALLET_POCKET_PITCH_M`, `PALLET_TRAY_HEIGHT_M`, per-colour PalletStation centre), then regenerate. Replace the uses of the `*_TOWER` lists, and keep or rename them deliberately; grep `WHITE_TOWER|SPINDLE_TOWERS|STACK_STEP` across src/web/tests.
2. **Layout**: choose lane y-centres and pitch so every pocket is reachable from the whole real pick band, including the braked lead at y ≈ −0.555. A first try (lanes y −0.32/−0.10/+0.12, pitch 0.09, pockets x −0.24..−0.60) failed at one corner pocket, but that was with the OLD 0.25 m travel height. Re-check it with the new, lower one. Lanes must not overlap: tray width ≈ 2 × pitch + wall.
3. **WorkcellNode** `get_drop_slot`: return pocket k's (x, y) at tray-top z, filled from the pocket nearest the arm. Update the workcell tests (`test_workcell_*`).
4. **Planner**: drop the pin-tip release (`RELEASE_HEIGHT_M`) and lower onto the pocket. `TRANSFER_HEIGHT_M` = tray wall + gear + clearance. Re-check `APPROACH_LIFT_OFFSET_M` (0.15 was chosen for rod clearance; 0.10 may be enough now). Rewrite the strike test against the tray boxes (all three trays, the target tray's walls included, with only the target pocket allowed). Keep the corner/branch/URDF-limit tests.
5. **Web scene** (read `.agents/rules/threejs-rep103.md`): replace `assets/tower.ts` and the RearStand pieces with a tray asset on each lane (`assets/palletlanes.ts`), with gears seated in pockets. Today the visible stack grows on the rod, so the counts→geometry mapping must move to pockets (`utils/towerCounts.ts`, Visualizer). Update the E2E pages and steps that read tower meshes.
6. **Docs**: update D37's wording where it still says pins, plus the overview user story 9, and ADR 0006 if it mentions rods.
7. **Verify**: `scripts/verify.sh` must print GREEN. ALSO run the full-flow launch test, which verify.sh does not run: `ROS_DOMAIN_ID=77 python3 -m pytest -q -p no:cacheprovider src/ros2/robot_bringup/test/test_cell_flow_launch.py` (about 8 min; use an isolated domain while a SIM is running).
