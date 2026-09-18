---
# hand-sim-1h63
title: 'Unit 6.5-Bugfix.2.2: ROS2 EdgeBridge Node - Pick-and-Place Action Bridge & Workcell Services'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-18T15:00:09Z
updated_at: 2026-09-18T15:00:09Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-o5es
---

Extend EdgeBridgeNode in src/ros2/arm_controller/arm_controller/edge_bridge_node.py to bridge PICK_AND_PLACE_TARGET from Zenoh topic robot/{id}/command to ROS2 ActionClient /arm_controller/pick_and_place (PickAndPlace.action). Stream action feedback to Zenoh. Bridge SPAWN_OBJECT and CLEAR_WORKSPACE commands to /workcell/spawn_object and /workcell/clear_workspace ROS2 services. Reflect gripper/palm state (is_grasped) dynamically during GRASPING and RELEASING phases. Add hermetic unit test in src/ros2/arm_controller/test/test_edge_bridge_actions.py.
