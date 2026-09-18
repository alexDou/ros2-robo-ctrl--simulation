---
# hand-sim-1h63
title: 'Unit 6.5-Bugfix.2.2: ROS2 EdgeBridge Node - Pick-and-Place Action Bridge & Workcell Services'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-18T15:00:09Z
updated_at: 2026-09-18T15:51:49Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-o5es
---

Extend EdgeBridgeNode in src/ros2/arm_controller/arm_controller/edge_bridge_node.py to bridge PICK_AND_PLACE_TARGET from Zenoh topic robot/{id}/command to ROS2 ActionClient /arm_controller/pick_and_place (PickAndPlace.action). Stream action feedback to Zenoh. Bridge SPAWN_OBJECT and CLEAR_WORKSPACE commands to /workcell/spawn_object and /workcell/clear_workspace ROS2 services. Reflect gripper/palm state (is_grasped) dynamically during GRASPING and RELEASING phases. Add hermetic unit test in src/ros2/arm_controller/test/test_edge_bridge_actions.py.



## Summary of Implementation
- Defined `srv/SpawnObject.srv` and registered in `robot_control_interfaces/CMakeLists.txt`.
- Implemented `/workcell/spawn_object` service in `workcell_node.py`.
- Extended `EdgeBridgeNode` to bridge `PICK_AND_PLACE_TARGET` to `ActionClient` on `/arm_controller/pick_and_place` with feedback streaming to Zenoh topic `rt/arm_controller/pick_and_place/_action/feedback`.
- Dynamically reflected gripper/palm state (`_is_grasped`) on `GRASPING` and `RELEASING` phases in telemetry.
- Bridged `SPAWN_OBJECT` and `CLEAR_WORKSPACE` commands to ROS2 service clients.
- Authored hermetic unit tests in `src/ros2/arm_controller/test/test_edge_bridge_actions.py` and updated `tests/` suites.
- Verified: all 69 pytest tests, 28 cargo tests, and 166 web vitest tests pass cleanly.
