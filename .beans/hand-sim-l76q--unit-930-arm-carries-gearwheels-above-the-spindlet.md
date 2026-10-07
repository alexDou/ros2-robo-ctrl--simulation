---
# hand-sim-l76q
title: 'Unit 9.30: Arm carries Gearwheels above the SpindleTower pins'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-07T15:44:37Z
updated_at: 2026-10-07T16:00:31Z
parent: hand-sim-rqpy
---

D37. PickAndPlaceTrajectoryGenerator: lift/approach/retreat via a travel height above pin tops + Gearwheel + clearance; vertical lower onto the slot. Regression test samples each segment against all three pins (white/green deliveries currently cross the blue pin).

Done: lift/transfer/retreat at TRANSFER_HEIGHT_M (pin top + Gearwheel + 3 cm); release threaded on the pin tip (RELEASE_HEIGHT_M), the Gearwheel slides to its slot. test_transfer_never_strikes_a_pin samples HOME..HOME against all pins.
