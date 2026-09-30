---
# hand-sim-pabi
title: 'PickAndPlace aborted: path tolerance violation (FAULT mid-run)'
status: completed
type: bug
priority: normal
created_at: 2026-09-30T13:09:12Z
updated_at: 2026-09-30T13:37:28Z
parent: hand-sim-d04j
---

Video unit8_bug--erorr-pickandplace_failed.webm. Log ~/.ros/log/2026-09-30-12-50-51-382073-ros2-74982/launch.log:676: scaled_joint_trajectory_controller abort, joints 0,3,5 error 0.28/-0.22 rad vs 0.2 trajectory tolerance, ~1s after the gear was committed to the tower (pick (0.503,-0.246) -> GREEN tower (-0.45,-0.10) slot 0). The UI shows only generic 'PickAndPlace failed'. Same error recurs in earlier sessions (09-30 10:33, 12:46). Suspects: large joint swing vs MAX_JOINT_VELOCITY 2.0 rad/s timing + 5 Hz fake hardware lag vs 0.2 tolerance (ur_controllers.yaml). Needs root-cause diagnosis before fixing.

## Resolution (5161352)

Root cause: a controller_manager overrun on the 5 Hz GenericSystem mock, not velocity alone. Measured with a probe on /scaled_joint_trajectory_controller/controller_state in an isolated ROS domain: a 2.5 rad swing at 2 rad/s avg tracks with about 0.01-0.02 rad error at nominal timing, even under full CPU load. SIGSTOP-ing ros2_control_node for 250 ms mid-swing (matching the 10:33 log line 'Overrun detected ... loop took 250 ms, missed cycles: 2', right at that abort) reproduced 'Aborted due to path tolerance violation' with errors of 0.3-0.7 rad at 1-2 rad/s. Error scales as velocity x tick lateness.

The 12:46 and 12:50 aborts have no logged overrun at the abort (the log only reports 2 or more missed cycles), so the late-tick mechanism is consistent with them but not proven.

Fix: ur_controllers.yaml sets trajectory: 0.0 (path check off) on all joints for sim. On the mock the path error can never detect a real deviation. Goal tolerance 0.1 kept. ur_controllers_real.yaml keeps 0.2, locked by tests/test_controller_constraints.py. Re-ran the 250 ms stall probe on the fixed config: every goal succeeded. Trade-off: overruns no longer surface as faults, they are only logged.

Follow-up: generic UI 'PickAndPlace failed' text filed as hand-sim-w4oa.
