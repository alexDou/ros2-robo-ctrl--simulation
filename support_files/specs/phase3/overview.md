### Physics Activation & 3D Spatial Mapping

* Goal: Stream dynamic 6-DoF UR5e joint motion at 30 Hz through EdgeNode and Gateway, and project kinematic link poses onto an interactive 3D WebGL scene at 60 FPS in TeleopClient with a 75/25 responsive split layout.
* Agent Instructions: Package and serve UR5e visual Collada mesh assets (`.dae`) in TeleopClient via Vite public directory. Configure `urdf-loader` and Three.js with OrbitControls, ground grid, and lighting. Enforce REP-103 ↔ WebGL frame mapping (`robotGroup.rotation.x = -Math.PI / 2`). Implement `mock_motion_publisher.py` emitting smooth multi-axis sinusoidal sweeps across all 6 joints. Synchronize telemetry to `URDFRobot` links at 60 FPS via zero-order hold with dirty-checking to prevent browser GPU hangs. Gazebo Harmonic integration is deferred to Phase 4.
* TDD Assertion Matrix:
* Test 1 (EdgeNode / Python): Unit and standalone tests for `mock_motion_publisher.py` asserting steady 30 Hz multi-joint sinusoidal trajectories adhering to `RobotTelemetryEvent` schema.
* Test 2 (TeleopClient / Vitest): Component tests asserting URDF loads via `urdf-loader`, camera/scene initializes, unmount cleans up WebGL contexts cleanly, and link transforms update when `ArmJointPositions` change.
* Test 3 (Integration / Playwright): Multi-service E2E integration test asserting that 30 Hz dynamic sinusoidal joint motion updates the 3D visualizer meshes and sidebar telemetry readouts in real time within 50ms latency budget.
