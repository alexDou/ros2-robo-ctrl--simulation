---
# hand-sim-g9st
title: 'Unit 9.31a: web scene shows nest-tray Pallets (finish stashed WIP)'
status: completed
type: task
priority: high
tags:
    - ready-for-agent
created_at: 2026-10-07T19:37:50Z
updated_at: 2026-10-07T19:52:45Z
parent: hand-sim-rqpy
blocking:
    - hand-sim-4jbb
---

## Goal
Finish the web part of D38 (hand-sim-4jbb) from the stash 'hand-sim-4jbb WIP'. Read hand-sim-4jbb and .agents/rules/threejs-rep103.md first.

## Already in the stash
- web/src/utils/pallet.ts pocketCoords (mirrors workcell_manager.pallet) + tests/unit/utils/pallet.test.ts (green).
- assets/pallettray.ts (base box + extruded nest plate with 10 bores); tower.ts and rearstand.ts deleted (git rm); stage.ts mounts palletTrayAssets; Visualizer slides the trays by lane offset; handle.ts/global.d.ts: getPalletTrayMeshes / getPalletTrayMeshByColor replace getSpindle*; getRearStandMesh removed; constants SPINDLE_TOWERS -> PALLET_STATIONS (StationCoords); palletlanes.ts widened to 0.2 m, length = travel + tray.
- mock_gateway.ts drops intact gears into pocketCoords; e2e support/kinematics.ts uses the D38 heights; mockGatewaySeeded tests green.
- Test renames done with sed (SPINDLE_TOWERS, getSpindleTowerMesh(es|ByColor)); fixtures, tower_disposal and pallet_lanes tests rewritten; tower_fixtures.test.tsx renamed to pallet_tray.test.tsx, builder section rewritten.

## Left
1. pallet_tray.test.tsx lines ~142-154: the stage test still calls getSpindleTowerMeshes/getSpindleTowerMesh/SPINDLE_TOWERS (legacy probe). Switch it to getPalletTrayMeshes/ByColor and drop the legacy block.
2. `npm --prefix web run typecheck`: fix whatever is left. On the last run only the files above failed, and TeleopPage.ts has been fixed since.
3. Tests that seed processed gears at the station centre with z = k*0.02 (pallet_lanes stackGear, recolor, tower_buckets, feedback): seed them at pocketCoords, and keep what each asserts (rides with the tray, hidden while unloaded).
4. vitest tests/unit, oxlint, oxfmt.
5. Screenshot check (img-read or run skill): trays on the lanes, gears seated in pockets, camera still frames them.
Don't run verify.sh here; hand-sim-4jbb runs the gate once.


## Done 2026-10-07 (session 3)
Stage test switched to getPalletTrayMeshes/ByColor; obsolete SpindleTower fixture test removed from tower_buckets; bore-centre test uses the bounding box (the closed arc repeats its first point); lane rollers lowered so their tops sit flush at Z = 0 under the tray; pallet_lanes seeds gears at pocketCoords. typecheck, oxlint (warnings only, pre-existing), oxfmt, vitest 291/291 green. Screenshot via a mock-gateway seed (10/4/7): trays on lanes, gears in pockets, camera frames them.
