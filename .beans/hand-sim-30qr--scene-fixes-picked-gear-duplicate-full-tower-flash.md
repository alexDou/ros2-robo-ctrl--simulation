---
# hand-sim-30qr
title: 'Scene fixes: picked gear duplicate, full tower flash on return, counters overlay replaces stand panel'
status: completed
type: bug
created_at: 2026-10-07T15:14:09Z
updated_at: 2026-10-07T15:14:09Z
parent: hand-sim-rqpy
---

- Picked Gearwheel stayed on the belt while riding the flange: belt copy hidden once the workcell holds it in_progress/processed (withoutLifted).
- Full Pallet flashed at HOME after an exchange: Pallet stays unloaded until workcell_state clears its stack (palletMotion latch).
- Grey counters overlay gains FEEDER and BIN; post-mounted display panel removed (D25/D34 updated).
