
### Phase 2: Frame Aggregation & Zero-State Telemetry

* Goal: Stream live, zero-state structural telemetry (empty joint matrices) from a blank ROS2 simulator node through Actix to a Preact screen display.
* Agent Instructions: Configure a mock ROS2 publisher inside the VM environment that acts as a dummy data simulator.
* TDD Assertion Matrix:
* Test 1 (Python): Unit test the mapping logic that converts raw sensor_msgs/msg/JointState values into the standardized telemetry JSON schema.
   * Test 2 (Rust): Create a mock Zenoh publisher that fires synthetic data packets into Actix, verifying that the WebSocket actor correctly broadcasts the payloads out to all listening browsers.
   * Test 3 (Preact): Write a Vitest front-end component test ensuring that receiving an empty telemetry frame transitions the UI state from DISCONNECTED to CONNECTED / IDLE.

### Phase 3: Physics Activation & 3D Spatial Mapping

* Goal: Spin up a realistic industrial arm (UR5e or Franka Panda configuration) running headless in Gazebo, and project its spatial coordinates onto a 3D web canvas.
* Agent Instructions: Pull down the verified simulation configuration packages. Connect your UI layer using a lightweight Three.js wrapper.
* TDD Assertion Matrix:
* Test 1 (Simulation): Execute a launch assertion validating that /joint_states are publishing data updates at a minimum frequency of 30Hz inside the VM.
   * Test 2 (Preact): Render a Three.js scene utilizing mocked joint array properties ([0,0,0,0,0,0]) and test that changing a vector property dynamically translates the corresponding 3D object transformation matrix.
   * Test 3 (Integration): Manually shift a joint position within the Gazebo environment using standard CLI utility tools, then verify that the Preact UI records the exact spatial deviation value within a 50ms processing window.

### Phase 4: Object Ingestion & AI Model Orchestration

* Goal: Spawn a physical object inside the Gazebo world workspace, capture the virtual camera feed buffer, and pass it directly to an ONNX computer vision thread.
* Agent Instructions: Mount a camera sensor frame within the Gazebo world mapping. Initialize a lightweight object processing thread using ONNX Runtime.
* TDD Assertion Matrix:
* Test 1 (Python Domain): Write an offline unit test for the inference pipeline. Feed a static test image file containing a package directly into the ONNX execution block and assert that it correctly returns the bounding box coordinates.
   * Test 2 (Rust Gateway): Unit test the API dispatch routing endpoints (e.g., POST /api/v1/dispatch) to verify that invalid target coordinate schemes throw an HTTP 422 Unprocessable Entity error code.
   * Test 3 (Integration): Confirm that triggering an image evaluation update successfully maps target tracking values straight to your cloud telemetry dashboard fields.

### Phase 5: Motion Trajectories & End-to-End Closing

* Goal: Bridge manual operational inputs and automated inference results to execute physical picking movements inside the Gazebo simulation workspace.
* Agent Instructions: Implement the ROS2 Action client logic inside the Python worker node using MoveIt2 path planners.
* TDD Assertion Matrix:
* Test 1 (Python Robotics Domain): Inject a mock coordinate target into the path planning node, and assert that it handles motion planning failures (e.g., target out of reach) gracefully by throwing a custom domain exception instead of crashing the process thread.
   * Test 2 (Frontend Interface): Write a test ensuring that clicking the "EMERGENCY STOP" button on the UI instantly serializes a priority stop event string across the active WebSocket network.
   * Test 3 (System End-to-End): Execute a fully automated test run: object is spawned → camera detects it → Python triggers a ROS2 movement action → arm moves → Preact graphs the telemetry → arm reports success.

------------------------------
### Step-by-Step Prompts for Your AI Agent Harness
To kick off development with your AI coding assistant, feed it these exact prompts in sequence:
Select the initial component file block to generate and test inside your project directory:
Generate the Phase 1 Configuration Blueprint: Write the complete terminal setup scripts for Ubuntu 24.04 inside VirtualBox and the basic multi-layer project directories.Generate the Phase 1 TDD Suite: Create the initial Rust Actix-web server test framework and Python Zenoh validation scripts before implementing any core service logic.Generate the Preact + Vite Telemetry Consumer Hook: Implement the baseline TypeScript WebSocket state engine component alongside its corresponding Vitest test layout profiles.

