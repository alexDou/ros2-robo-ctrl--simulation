# 0002. In-Process WorkcellState Isolation Over Dedicated SpawnNode Process

## Status
Accepted

## Context
During Unit 5 design ("Interactive 3D Workcell & Click-to-Place Gear Ingestion"), we considered how workpiece spawning and active scene presence should be managed across the architecture. One option was introducing an external `SpawnNode` microservice process communicating over a separate Zenoh key expression (`workcell/0/command`). However, managing a 4th concurrent process adds significant orchestration overhead in CI, test harnesses, and Playwright E2E suites. Furthermore, in Unit 6, the robot arm must execute pick-and-place trajectories using the active workpiece coordinates, requiring inter-node state queries if split across separate services.

## Decision
We decided to keep `EdgeNode` as the sole backend robotics node while enforcing strict architectural separation internally via a dedicated `WorkcellState` domain component. `EdgeNode` ingests `SPAWN_OBJECT` and `CLEAR_WORKSPACE` commands directly from the DataFabric (`robot/{id}/command`), validates `SingleCommandGating` and single-gear placement lockouts, and maintains authoritative active workpiece coordinates in-process.

## Consequences
- Process architecture remains clean and manageable: exactly 3 core tiers (`TeleopClient`, `Gateway`, `EdgeNode`) in local development, CI, and Playwright suites.
- Robot motion control logic remains decoupled from workpiece state tracking via modular class boundaries inside `EdgeNode`.
- Downstream Unit 6 analytical inverse kinematics (IK) waypoint planning can query workpiece target coordinates directly without inter-process IPC hops or dual-command dispatch.
- If Gazebo world spawning is integrated later, `WorkcellState` acts as the single seam connecting incoming commands to the ROS2 `/spawn_entity` client.
