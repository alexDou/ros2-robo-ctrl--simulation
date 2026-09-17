---
# hand-sim-glrj
title: 'Refactor-A.0: ROS2 Interfaces Package (PickAndPlace, GetDropSlot, ClearWorkspace)'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:19Z
updated_at: 2026-09-17T12:42:54Z
parent: hand-sim-wt44
---

## Parent

hand-sim-wt44

## What to build

Authoritative ament_cmake ROS2 interfaces package robot_control_interfaces defining PickAndPlace.action, GetDropSlot.srv, and ClearWorkspace.srv per unit_refactoring-a specs. Compiles with colcon build and exports C++ and Python bindings.

## Acceptance criteria

- [ ] CMakeLists.txt and package.xml configured with rosidl_default_generators and action/geometry message dependencies
- [ ] PickAndPlace.action defines goal (pick_coords, drop_coords, use_custom_drop, command_id), result (success, message), and feedback (phase, percent_complete)
- [ ] GetDropSlot.srv defines response with drop_coords Point, slot_index, and overflow_occurred flag
- [ ] ClearWorkspace.srv defines request/response lifecycle contract
- [ ] colcon build --packages-select robot_control_interfaces succeeds without errors
- [ ] Interface introspection confirms valid types via ros2 interface show

## Blocked by

None (can start immediately)
