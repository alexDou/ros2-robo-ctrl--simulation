# 0003. Analytical UR5e Inverse Kinematics and Event-Driven Workcell Coordination

## Status
Accepted

## Context
During Unit 6 design ("Autonomous Pick-and-Place to Common Destination"), we evaluated motion planning and inter-module coordination for UR5e manipulator trajectories between workcell pickup points and the Spindle Tower drop destination. One approach was integrating MoveIt2 / ROS2 action servers (`MoveGroupAction`) communicating over external DDS topics. However, MoveIt2 requires heavy C++ dependencies, OMPL path planners with variable computation times (100–500ms), and complex collision scene maintenance that complicates fast automated test loops and deterministic CI execution. Furthermore, we needed `WorkcellState` to coordinate workpiece spawning and tower inventory without tight coupling to the robotics controller or UR5e kinematics.

## Decision
1. We implement a closed-form analytical UR5e inverse kinematics (IK) solver in pure Python within `EdgeNode`, solving the 8 kinematic branches for vertical top-down tool orientations ($Z$-down suction nozzle) with explicit tool center point (TCP) offset ($0.108\text{m}$). From valid solutions within $[-\pi, \pi]$, the solver deterministically selects the branch with minimal Euclidean angular distance from current joint positions.
2. We decouple `WorkcellState` from `EdgeNode` motion execution using an in-process publisher-subscriber event seam. `WorkcellState` tracks workcell geometry, active gear placement, and tower stacking inventory (max 10 visual gears with FIFO bottom-drop overflow). When a workpiece is spawned, `WorkcellState` publishes a domain event (`WorkpieceSpawnedEvent`) carrying pick and next vacant drop coordinates. `EdgeNode` subscribes to this event, solves the analytical IK waypoints, and executes the deterministic 10-step pick-and-place sequence while streaming 30 Hz telemetry.

## Consequences
- Deterministic sub-millisecond IK calculation without external C++ or MoveIt2 dependencies, keeping unit test runs fast and reproducible.
- Clean separation of concerns: `WorkcellState` manages workspace fixtures, inventory, and Cartesian coordinates; `EdgeNode` manages kinematics, trajectory execution, and lifecycle state.
- Three.js visualizer receives continuous 30 Hz telemetry frames and applies deterministic link attachment and tower stacking with zero physics engine friction jitter.
