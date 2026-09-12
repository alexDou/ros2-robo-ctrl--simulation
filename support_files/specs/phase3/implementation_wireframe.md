> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-3-3d-visualization--dynamic-kinematic-sync) and [dev_phases.md](../dev_phases.md#phase-3-physics-activation--3d-spatial-mapping). Use the vertical walking skeleton defined in Unit 3 as the canonical Phase 3 specification. Per ADR-0001, Gazebo Harmonic physics activation is deferred to Phase 4; Phase 3 focuses on dynamic mock motion generation, Three.js URDF visualization, and 75/25 split UI.

Welcome to Phase 3: 3D Visualization & Dynamic Kinematic Sync. As a senior engineer, our goal is to evolve the system from the zero-state structural telemetry established in Phase 2 into a full dynamic 3D WebGL robotics visualizer running inside TeleopClient, driven by a 30 Hz continuous multi-axis sinusoidal telemetry stream.

We will apply Domain-Driven Design (DDD), Clean Architecture, and Specification-Driven Development (SDD) with strict TDD. In this phase, `mock_motion_publisher.py` will emit realistic 30 Hz multi-joint sinusoidal trajectories over DataFabric. TeleopClient presents a responsive split layout with a prominent 75% 3D `RobotVisualizer` viewport on the left and a 25% `TelemetryMonitor` sidebar on the right. The 3D scene loads the canonical UR5e kinematic chain via `urdf-loader` and native Collada (`.dae`) meshes, maps REP-103 coordinates to WebGL (`robotGroup.rotation.x = -Math.PI / 2`), and updates joint link transforms smoothly using a Zero-Order Hold latch with dirty-checking to eliminate idle GPU load and prevent browser hangs.

Here is the exact step-by-step execution plan.
------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once URDF schemas and static mesh distribution assets are established in Unit 3.0, the dynamic mock motion publisher (Unit 3.1), 3D canvas viewport (Unit 3.2), and kinematic sync loop (Unit 3.3) execute concurrently against mocked interface seams. Only the final multi-service system integration suite (Unit 3.4) depends on all components.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 3.0: URDF Model & Static Mesh Asset Distribution  │
                    │ (Extract URDF, bundle Collada meshes, loader mapping)  │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                              │                    1          │
                 ▼                              ▼                              ▼
┌─────────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────────┐
│ Unit 3.1: EdgeNode              │ │ Unit 3.2: TeleopClient      │ │ Unit 3.3: 60 FPS Kinematic Sync │
│ Dynamic Sinusoidal Mock Pub     │ │ Three.js Scene & 75/25 UI   │ │ Zero-Order Hold + Dirty Check   │
│ (Tested vs 30 Hz stream contract│ │ (Tested vs Three.js/DOM)    │ │ (Tested vs URDF mock buffer)    │
└────────────────┬────────────────┘ └──────────────┬──────────────┘ └────────────────┬────────────────┘
                 │                                 │                                 │
                 └──────────────────────────────┬──┴─────────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 3.4: Dynamic Multi-Service E2E Suite              │
                    │ (Live integration: Mock Pub + Edge + Gateway + Web)    │
                    └────────────────────────────────────────────────────────┘
```

## Step 1: URDF Model Extraction & Static Asset Distribution (Unit 3.0)
TeleopClient requires the UR5e kinematic definition and 3D visual meshes to render the arm in Three.js WebGL.

1. **URDF Model Processing**:
   - Extract the canonical UR5e URDF from `ur_simulation_gz` xacro (`ur_gz.urdf.xacro`) with `ur_type:=ur5e`.
   - Strip physics plugins (`gz_ros2_control`, transmissions, collision geometry) into a clean, client-side visual URDF: `web/public/models/ur5e/ur5e.urdf`.
   - Ensure mesh links reference package URIs: `package://ur_description/meshes/ur5e/visual/<part>.dae`.
2. **Static Mesh Asset Bundling**:
   - Copy canonical UR5e visual Collada meshes (`base.dae`, `shoulder.dae`, `upperarm.dae`, `forearm.dae`, `wrist1.dae`, `wrist2.dae`, `wrist3.dae`) from `/opt/ros/jazzy/share/ur_description/meshes/ur5e/visual/` to `web/public/models/ur_description/meshes/ur5e/visual/`.
   - Serve static assets directly through Vite public directory with zero runtime build transformation.
3. **Loader Package Resolution Factory**:
   - Create `web/src/utils/robotLoader.ts` using `urdf-loader` and Three.js `ColladaLoader`.
   - Configure `loader.packages = { ur_description: '/models/ur_description' }` to resolve all ROS package mesh URIs.
4. **TDD Verification (`vitest`)**:
   - Unit test asserting `createRobotLoader` parses the visual URDF without errors.
   - Assert all 6 canonical UR5e revolute joints (`shoulder_pan_joint`, `shoulder_lift_joint`, `elbow_joint`, `wrist_1_joint`, `wrist_2_joint`, `wrist_3_joint`) are present and indexed correctly in the parsed `URDFRobot`.

## Step 2: EdgeNode 30 Hz Continuous Sinusoidal Mock Motion Publisher (Unit 3.1)
Provide a deterministic, high-quality dynamic motion source to drive continuous multi-axis arm movement without launching external physics simulators.

1. **Standalone Script (`src/edge_node/mock_motion_publisher.py`)**:
   - ROS2 node publishing `sensor_msgs/msg/JointState` to `/joint_states` at 30 Hz.
   - Computes smooth sinusoidal motion profiles per canonical UR5e joint:
     - `shoulder_pan_joint`: $0.5 \sin(0.4 \pi t)$
     - `shoulder_lift_joint`: $-0.785 + 0.3 \sin(0.3 \pi t)$
     - `elbow_joint`: $1.57 + 0.4 \sin(0.5 \pi t)$
     - `wrist_1_joint`: $-0.785 + 0.2 \sin(0.6 \pi t)$
     - `wrist_2_joint`: $0.4 \sin(0.7 \pi t)$
     - `wrist_3_joint`: $0.5 \sin(0.8 \pi t)$
2. **Deterministic Time-Stepping**:
   - Supports configurable frequency (default: 30 Hz) and speed scaling factor.
   - Emits joint names matching `UR5E_JOINTS` canonical ordering.
3. **TDD Verification (`pytest`)**:
   - Unit test asserting `MockMotionPublisher` generates continuously smooth positions within joint limits $[-\pi, \pi]$.
   - Assert timer loop maintains stable 30 Hz cadence without drift.

## Step 3: TeleopClient Three.js RobotVisualizer Canvas & Scene Infrastructure (Unit 3.2)
Construct a lightweight, performant Three.js WebGL viewport component integrated into TeleopClient.

1. **Scene Setup & Lighting**:
   - Create `web/src/components/RobotVisualizer.tsx`:
     - Three.js `WebGLRenderer` with `antialias: true`, alpha transparency, and pixel ratio clamping (`Math.min(window.devicePixelRatio, 2)`).
     - `PerspectiveCamera` with 45° FOV, isometric preset at `[1.2, 0.8, 1.2]`, looking at `[0, 0.4, 0]`.
     - Lighting: Hemisphere/Ambient light for uniform baseline illumination + directional key light with soft shadow mapping.
     - Ground grid: `GridHelper(2, 20, 0x444444, 0x222222)` marking workspace scale.
     - Controls: `OrbitControls` with zoom/pan clamping and damping (`enableDamping: true`).
2. **Lifecycle & Memory Management**:
   - Mount renderer to container DOM element ref.
   - Implement `ResizeObserver` for dynamic canvas resizing without distortion.
   - Comprehensive disposal on unmount: cancel animation frame, dispose geometries, materials, textures, controls, and force WebGL context loss to guarantee zero memory leaks or GPU hang.
3. **UI Layout Integration**:
   - Split layout in `TeleopClient.tsx`:
     - Desktop: 3D `RobotVisualizer` occupies 75% primary canvas; `TelemetryMonitor` occupies 25% right sidebar rail with stacked vertical metrics.
     - Narrow displays: Stacked vertically with viewport prioritized.
4. **TDD Verification (`vitest`)**:
   - Component test verifying canvas mounts, initializes renderer and camera, and handles container resize events.
   - Verify unmount cleanly calls disposal functions on Three.js scene graph objects.

## Step 4: 60 FPS Telemetry Kinematic Synchronization & REP-103 Frame Alignment (Unit 3.3)
Synchronize live 30 Hz DataFabric joint positions to the 3D model links inside the WebGL render loop with dirty-checking to protect browser performance.

1. **REP-103 ↔ WebGL Coordinate Alignment**:
   - ROS REP-103 convention: +X forward, +Y left, +Z up.
   - WebGL convention: +X right, +Y up, +Z back.
   - Apply root transformation: `robotGroup.rotation.x = -Math.PI / 2`.
   - Invariant: Zero manual swizzling of quaternion components.
2. **Zero-Order Hold with Dirty-Checking**:
   - The animation loop queries the shared non-reactive telemetry buffer ref (`useTelemetryStream`).
   - Compare latest `ArmJointPositions` against previously rendered angles.
   - If changed or if `OrbitControls` is actively panning/rotating, apply `robot.setJointValue(jointName, angleRad)` and call `renderer.render(scene, camera)`.
   - If stationary and controls are idle, skip render call. This eliminates unnecessary GPU load and prevents browser tab sluggishness.
3. **TDD Verification (`vitest`)**:
   - Unit test asserting updating joint values on loaded `URDFRobot` updates descendant link transformation matrices.
   - Assert REP-103 base group rotation is applied correctly (`rotation.x === -Math.PI / 2`).

## Step 5: Dynamic Multi-Service Integration & Latency Suite (Unit 3.4)
Validate the full vertical walking skeleton under continuous dynamic motion.

1. **End-to-End Dynamic Motion Test**:
   - Automated integration suite spinning up:
     1. Mock Motion Publisher (`python -m src.edge_node.mock_motion_publisher --rate 30`)
     2. EdgeNode (`python -m src.edge_node.main`)
     3. Gateway (`cargo run -p gateway`)
     4. TeleopClient (`npm --prefix web run dev`)
2. **Actuation & Latency Assertion**:
   - Assert in Playwright that TeleopClient 3D canvas is active and `TelemetryMonitor` displays ~30 Hz stream with latency < 50ms.
   - Assert that joint values on screen vary smoothly in accordance with sinusoidal waves.
   - Verify zero dropped frames and zero memory accumulation during sustained 30-second run.

------------------------------
## The Integration Verification (The Dynamic 3D Spatial Sync Test)
Once all steps are implemented, verify the complete Phase 3 vertical slice:

1. Start Mock Motion Publisher: `python -m src.edge_node.mock_motion_publisher --rate 30`.
2. Start EdgeNode: `python -m src.edge_node.main`.
3. Start Gateway: `cargo run -p gateway`.
4. Launch TeleopClient: `npm --prefix web run dev`.
5. Open TeleopClient in browser:
   - Left 75% pane renders UR5e arm in 3D WebGL on ground grid, smoothly moving through continuous multi-axis sinusoidal sweeps.
   - Right 25% sidebar rail displays `CONNECTED / IDLE` with steady ~30 Hz stream and latency < 50ms.
   - All 6 joint coordinate cards update dynamically in sync with the 3D arm motion.

------------------------------
### Ready to Begin Implementation
Choose the initial component to implement:
1. **Unit 3.0 (Asset Pipeline)**: Extract UR5e URDF, bundle Collada visual meshes in `web/public`, and implement `robotLoader.ts` with vitest tests.
2. **Unit 3.1 (Dynamic Mock Motion)**: Implement `src/edge_node/mock_motion_publisher.py` and pytest test coverage.
3. **Unit 3.2 & 3.3 (TeleopClient 3D & 75/25 Layout)**: Implement `RobotVisualizer.tsx`, OrbitControls, 75/25 layout in `TeleopClient.tsx`, and dirty-checked kinematic sync loop.
