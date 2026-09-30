---
# hand-sim-pabi
title: 'PickAndPlace aborted: path tolerance violation (FAULT mid-run)'
status: todo
type: bug
created_at: 2026-09-30T13:09:12Z
updated_at: 2026-09-30T13:09:12Z
parent: hand-sim-d04j
---

Video unit8_bug--erorr-pickandplace_failed.webm. Log ~/.ros/log/2026-09-30-12-50-51-382073-ros2-74982/launch.log:676: scaled_joint_trajectory_controller abort, joints 0,3,5 error 0.28/-0.22 rad vs 0.2 trajectory tolerance, ~1s after the gear was committed to the tower (pick (0.503,-0.246) -> GREEN tower (-0.45,-0.10) slot 0). The UI shows only generic 'PickAndPlace failed'. Same error recurs in earlier sessions (09-30 10:33, 12:46). Suspects: large joint swing vs MAX_JOINT_VELOCITY 2.0 rad/s timing + 5 Hz fake hardware lag vs 0.2 tolerance (ur_controllers.yaml). Needs root-cause diagnosis before fixing.
