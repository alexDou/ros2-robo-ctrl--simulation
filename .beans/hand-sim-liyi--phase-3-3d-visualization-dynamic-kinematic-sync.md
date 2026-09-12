---
# hand-sim-liyi
title: 'Phase 3: 3D Visualization & Dynamic Kinematic Sync'
status: todo
type: feature
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:00Z
updated_at: 2026-09-12T13:20:00Z
---

## Problem Statement

Remote teleoperators and robotics engineers need immediate, intuitive spatial situational awareness of the robotic manipulator's configuration in 3D space. While Phase 2 successfully proved continuous numerical telemetry streaming at 30 Hz, operators cannot reliably evaluate physical link postures, joint orientations, workspace limits, or reachability from raw numerical coordinate arrays alone. Furthermore, rendering a continuous 3D robotics simulation in a web browser introduces severe performance risks: unthrottled WebGL render loops, continuous mesh re-parsing, and Virtual-DOM reconciliation bottlenecks can easily cause memory bloat, high GPU utilization, thermal throttling, and interface freezes on standard or lower-spec operator workstations.

## Solution

A high-performance, lightweight 3D visualization and dynamic kinematic synchronization engine integrated seamlessly into `TeleopClient`:

1. An interactive 3D `RobotVisualizer` viewport powered by Three.js and `urdf-loader`, rendering the canonical UR5e 6-DoF manipulator on a calibrated workspace ground grid with smooth OrbitControls.
2. Direct static bundling and serving of native upstream Collada (`.dae`) visual meshes, parsed once upon component mount into static GPU buffer geometries with zero runtime decoding overhead or memory growth.
3. A responsive 75/25 split-pane interface in `TeleopClient` positioning the 3D `RobotVisualizer` prominently on the left (75% width on desktop) while organizing the `TelemetryMonitor` into a clean, compact right-hand vertical sidebar (25% width), dynamically collapsing into a single-column layout on mobile or narrow viewports.
4. A deterministic 30 Hz dynamic sinusoidal telemetry streaming generator (`mock_motion_publisher.py`) that exercises continuous multi-axis arm motion smoothly without spawning heavy Gazebo physics processes (deferred to Phase 4 per ADR-0001).
5. Zero-order hold kinematic latching with dirty-checked rendering: the WebGL animation loop updates link transforms and executes draw calls only when incoming joint angles change or when the user is actively orbiting the camera, dropping idle draw calls to zero and preventing browser hangs.
6. Rigorous REP-103 to WebGL coordinate frame alignment (+X forward, +Y left, +Z up) via root group transformation (`robotGroup.rotation.x = -Math.PI / 2`) with zero manual quaternion swizzling.

## User Stories

1. As a remote operator, I want to see an interactive 3D representation of the UR5e manipulator in TeleopClient, so that I can visualize its spatial orientation and posture in real time.
2. As a remote operator, I want the 3D arm model to mirror incoming joint telemetry at 30 Hz with sub-50ms latency, so that visual feedback is instantaneous and accurate.
3. As a remote operator, I want the 3D viewport to occupy 75% of the screen width on desktop, so that I have an expansive, unobstructed view of the manipulator workspace.
4. As a remote operator, I want the telemetry readouts arranged in a compact 25% sidebar on the right, so that numerical metrics remain visible without crowding the 3D scene.
5. As a remote operator on a mobile or narrow display, I want TeleopClient to collapse into a clean single-column stack, so that the application remains usable on any screen size.
6. As a remote operator, I want to rotate, pan, and zoom around the robot using mouse or touch gestures via OrbitControls, so that I can inspect link alignments from any angle.
7. As a remote operator, I want OrbitControls to be centered on the robot shoulder with clamped zoom limits, so that the manipulator cannot be panned out of view.
8. As a remote operator, I want a ground grid visible beneath the robot base, so that I can judge scale, height, and spatial orientation relative to the workspace floor.
9. As a remote operator, I want ambient and directional lighting in the 3D scene, so that the arm's contours, links, and depth are clearly discernible.
10. As a remote operator on a low-end laptop, I want the 3D visualizer to consume minimal CPU and GPU resources when the arm is stationary, so that my device does not experience thermal throttling or battery drain.
11. As a remote operator, I want the browser tab to remain completely fluid and responsive during active 3D motion, so that interface controls never stutter or freeze.
12. As a robotics engineer, I want the 3D visualizer to load the canonical UR5e URDF definition and official visual meshes, so that link lengths and joint pivot axes match the physical robot with 100% CAD parity.
13. As a robotics engineer, I want the visualizer to map ROS REP-103 coordinates (+X forward, +Y left, +Z up) to WebGL (+X right, +Y up, +Z back) cleanly, so that coordinate frames are mathematically true without ad-hoc component swizzling.
14. As a robotics engineer, I want all 6 canonical UR5e revolute joints (`shoulder_pan_joint`, `shoulder_lift_joint`, `elbow_joint`, `wrist_1_joint`, `wrist_2_joint`, `wrist_3_joint`) synchronized by exact joint name, so that link positions are deterministic regardless of sensor array ordering.
15. As a robotics engineer, I want a standalone dynamic mock motion publisher script that emits smooth 30 Hz sinusoidal trajectories across all 6 joints, so that I can verify continuous multi-axis motion without starting heavy simulation engines.
16. As a robotics engineer, I want each joint in the sinusoidal generator to oscillate at distinct frequencies and amplitudes, so that the arm traverses complex, realistic kinematic postures.
17. As a robotics engineer, I want joint angles in the mock motion generator strictly bounded within physical limits ($[-\pi, \pi]$), so that invalid self-colliding poses are avoided.
18. As a frontend developer, I want upstream Collada (`.dae`) visual meshes served as static assets directly through the web public directory, so that no runtime format conversion or complex build tooling is required.
19. As a frontend developer, I want `ColladaLoader` to parse mesh files once upon component mounting, so that runtime 60 FPS animation loops never touch XML or incur garbage collection overhead.
20. As a frontend developer, I want incoming telemetry stored in a mutable non-reactive reference buffer, so that 30 Hz network packets never trigger Virtual-DOM component re-renders.
21. As a frontend developer, I want the WebGL render loop to implement dirty-checking, so that draw calls are skipped entirely when joint angles and camera positions remain unchanged.
22. As a frontend developer, I want comprehensive cleanup on component unmount (canceling animation frames, disposing geometries, materials, textures, controls, and WebGL contexts), so that hot-reloading and route navigation never leak GPU memory.
23. As a test engineer, I want offline Vitest unit tests verifying URDF asset parsing and joint link hierarchy creation, so that asset distribution bugs are caught immediately in CI.
24. As a test engineer, I want offline Vitest unit tests asserting that updating `ArmJointPositions` correctly updates descendant link world matrices in Three.js, so that kinematic synchronization logic is hermetically proven.
25. As a test engineer, I want offline Pytest unit tests asserting that `MockMotionPublisher` generates continuous 30 Hz sinusoidal frames compliant with `RobotTelemetryEvent`, so that data contracts remain unbroken.
26. As a test engineer, I want an end-to-end Playwright integration test asserting that dynamic 30 Hz telemetry updates both the 3D canvas and sidebar numerical readouts in real time with latency < 50ms, so that full vertical slice performance is guaranteed.
27. As a software architect, I want Gazebo Harmonic physics simulation deferred to Phase 4 per ADR-0001, so that Phase 3 remains laser-focused on 3D spatial visualization and WebGL client performance.

## Implementation Decisions

- **Architecture and Deferral of Gazebo (ADR-0001)**:
  - In accordance with ADR-0001, live Gazebo Harmonic physics simulation startup is deferred to Phase 4 (Object Ingestion & AI Model Orchestration).
  - Phase 3 implements the full 3D spatial mapping and kinematic visualization pipeline driven by a dedicated, deterministic 30 Hz continuous sinusoidal mock motion publisher.
  - This eliminates heavy simulator boot overhead during development and CI while thoroughly testing 3D WebGL rendering and client synchronization under continuous multi-axis motion.

- **Asset Distribution and Static Mesh Loading**:
  - The canonical UR5e URDF definition is extracted from the upstream ROS2 configuration and stripped of physics/transmissions into a lightweight visual representation served from web public assets.
  - Official UR5e Collada (`.dae`) visual meshes are bundled directly in the web public asset directory under the standard package structure (`/models/ur_description/meshes/ur5e/visual/`).
  - A robot loader utility wraps `urdf-loader` and Three.js `ColladaLoader`, resolving `package://ur_description/` URIs directly to the static asset directory.
  - Meshes are parsed once upon initial load into static Three.js `BufferGeometry` and uploaded to GPU VRAM; the loader is never invoked during streaming.

- **Dynamic Sinusoidal Mock Motion Generator**:
  - Implemented as a standalone ROS2/EdgeNode executable (`mock_motion_publisher.py`).
  - Computes deterministic, smooth sinusoidal trajectories across all 6 canonical UR5e joints at 30 Hz (33.3ms interval).
  - Joint trajectories are parameterized with varied amplitudes, base offsets, and non-harmonic frequencies to generate rich, organic multi-axis arm motion.
  - Outputs are serialized directly into `sensor_msgs/msg/JointState` on `/joint_states` or directly into `RobotTelemetryEvent` frames over DataFabric.

- **UI Layout and Viewport Structure**:
  - TeleopClient adopts a 75/25 split desktop layout:
    - Left Viewport (75% width): Houses the Three.js `RobotVisualizer` canvas, maximizing visibility of the manipulator kinematic chain and workspace grid.
    - Right Sidebar (25% width): Houses the `TelemetryMonitor`, stacking operational state badges, stream rate (Hz), latency metrics, and 6 joint coordinate cards vertically.
  - On narrow viewports (< 1024px), the layout automatically reflows into a single-column stack, prioritizing the 3D viewport on top followed by telemetry readouts below.

- **3D Scene Configuration & Camera Controls**:
  - Perspective camera with 45° field of view, positioned at isometric inspection coordinates `[1.2, 0.8, 1.2]` and targeted at the shoulder pivot `[0, 0.4, 0]`.
  - OrbitControls enabled with smooth damping, zoom limits (preventing clipping inside links or zooming into infinity), and polar angle limits (preventing camera traversal below the ground plane).
  - Calibrated 1m x 1m ground grid helper with 10cm subdivisions providing clear visual reference of the robot base position.
  - Balanced lighting consisting of an ambient/hemisphere light for uniform diffuse illumination and a directional key light casting subtle depth shading.

- **Zero-Order Hold Kinematic Latch with Dirty-Checked Rendering**:
  - TeleopClient updates a mutable non-reactive buffer reference synchronously upon receiving WebSocket telemetry frames at 30 Hz.
  - The WebGL animation loop evaluates incoming `ArmJointPositions` against previously rendered values.
  - If joint angles have updated or if OrbitControls are actively moving, link rotations are applied (`robot.setJointValue`) and a single WebGL frame is rendered.
  - If joint angles are stationary and the camera is static, WebGL draw calls are bypassed entirely. This drops idle GPU consumption to near zero, eliminates CPU thrashing, and prevents browser tab sluggishness.

- **REP-103 Coordinate Alignment**:
  - Upstream URDF links conform to ROS REP-103 conventions (+X forward, +Y left, +Z up).
  - Three.js WebGL coordinates place +X to the right, +Y up, and +Z back.
  - Alignment is achieved strictly via root object transformation: `robotGroup.rotation.x = -Math.PI / 2`.
  - Manual swizzling of quaternion or vector components is strictly prohibited.

## Testing Decisions

- **Definition of a Good Test**:
  - Tests verify observable external behavior and contracts at defined architectural boundaries rather than asserting on private internal mechanics.
  - Tests survive internal refactoring as long as boundary inputs and outputs conform to domain contracts.
  - Assertions evaluate independent ground truth (such as expected link transformations or schema validation rules) rather than mirroring implementation equations.

- **Modules Tested**:
  - `robotLoader`: Tested via Vitest asserting successful parsing of the UR5e URDF, verification of all 6 canonical joints, and correct resolution of mesh package URIs.
  - `RobotVisualizer`: Tested via Vitest asserting proper canvas mounting, scene/camera initialization, responsive resize handling, and complete resource disposal on unmount.
  - Kinematic Synchronization: Tested via Vitest asserting that applying `ArmJointPositions` to `URDFRobot` dynamically updates descendant link world transformation matrices, and verifying REP-103 root rotation.
  - `mock_motion_publisher`: Tested via Pytest asserting smooth sinusoidal motion within joint limits, correct canonical joint ordering, and stable 30 Hz publication cadence.
  - TeleopClient Split Layout: Tested via Vitest asserting correct 75/25 grid styling and DOM coexistence of the 3D canvas and `TelemetryMonitor`.
  - Multi-Service Integration: Tested via Playwright verifying live end-to-end streaming from mock motion publisher to the 3D visualizer canvas and sidebar readouts within a 50ms latency budget.

- **Prior Art**:
  - Unit 1.4 (`web/tests/unit/TeleopClient.test.tsx`): Preact component test harness with mocked WebSocket and DOM element assertions.
  - Unit 2.1 (`tests/test_edge_node.py`): Pytest suite asserting joint extraction, zero-order hold, and schema serialization.
  - Unit 2.3 (`web/tests/unit/TelemetryMonitor.test.tsx`): Direct DOM text node verification and non-reactive buffer testing.
  - Unit 2.4 (`web/tests/e2e/features/teleop.feature`): Cucumber/Playwright multi-service integration test suite.

## Out of Scope

- Live Gazebo Harmonic physics simulation startup, physics engine tuning, and world spawner automation (deferred to Phase 4 per ADR-0001).
- Camera sensor attachment, Gazebo camera topic bridge, and ONNX computer vision inference pipelines (Phase 4).
- MoveIt2 motion planning, trajectory action servers, and obstacle avoidance (Phase 5).
- Gripper / end-effector hardware models and actuation (Phase 4/5).
- Bidirectional manual operator controls such as interactive joint sliders, teach pendants, or trajectory trigger buttons (Phase 4).
- Dynamic lighting shadows or post-processing effects (bloom, ambient occlusion) that would degrade low-end hardware performance.

## Further Notes

- **Asset Provenance**: The UR5e visual meshes are official Universal Robots CAD models released under the standard BSD open-source robotics license.
- **Three.js Dependencies**: Three.js (`^0.165.0`) and `urdf-loader` (`^0.12.5`) are already installed in `web/package.json`.
- **Coordinate Integrity**: Maintaining the REP-103 root group rotation ensures mathematical consistency across all future kinematics, trajectory previews, and sensor frames.
