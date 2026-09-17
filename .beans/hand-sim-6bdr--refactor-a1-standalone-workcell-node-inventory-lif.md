---
# hand-sim-6bdr
title: 'Refactor-A.1: Standalone Workcell Node & Inventory Lifecycle Services'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:23Z
updated_at: 2026-09-17T15:27:27Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-glrj
---

## Parent

hand-sim-wt44

## What to build

Standalone Python ROS2 node workcell_node in package workcell_manager tracking SpindleTower inventory and table workpiece coordinates. Exposes /workcell/get_drop_slot and /workcell/clear_workspace services, and publishes /workcell/inventory topic.

## Acceptance criteria

- [ ] ament_python package workcell_manager configured with entrypoint workcell_node
- [ ] WorkcellNode implements GetDropSlot service server calculating incremental tower height z_k = (k % 10) * 0.02m
- [ ] WorkcellNode enforces FIFO bottom-drop behavior on overflow (k > 10)
- [ ] WorkcellNode implements ClearWorkspace service server resetting inventory to 0
- [ ] WorkcellNode emits Int32 count to /workcell/inventory upon inventory update
- [ ] Unit tests in pytest verify drop slot calculation, overflow, and workspace clearing

## Blocked by

- hand-sim-glrj (Refactor-A.0)


## Summary of Changes

- Implemented standard ROS2 ament_python package `workcell_manager` with entrypoint `workcell_node`
- Implemented `WorkcellNode` exposing `workcell/get_drop_slot` (`GetDropSlot.srv`) and `workcell/clear_workspace` (`ClearWorkspace.srv`), and publishing inventory count updates to `workcell/inventory` (`std_msgs/msg/Int32`)
- Enforced incremental SpindleTower slot calculation: $z_k = (k \pmod{10}) \times 0.02\text{m}$ with base fixture elevation `tower_z`
- Enforced FIFO bottom-drop behavior on overflow ($k > 10$): fixes drop target at top slot index 9 ($z = 0.18\text{m}$) and sets `overflow_occurred = True`
- Enforced thread-safe atomic state transitions and lock-protected inventory topic publication
- Verified via colcon build, colcon test, ROS2 CLI service calls, and full pytest test suite
