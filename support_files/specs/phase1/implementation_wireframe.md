> [!IMPORTANT]
> Superseded by [units.md](./units.md) after architectural review. Use the 4 vertical walking skeletons in `units.md` as the canonical Phase 1 specification.

## Welcome to Phase 1: The "Ping" Pipeline. As a senior engineer, my goal isn't just to make a button click light up a terminal—it’s to establish our system's core network topology and data contracts. We are building a minimal, end-to-end, architectural skeleton.

We will use Domain-Driven Design (DDD) to keep things decoupled, and Specification-Driven Development (SDD) with TDD to ensure every link works reliably. By the end of this phase, clicking a button in your Preact UI will send a command through an Actix Web Socket, hop onto the Zenoh data fabric, pass through a Python worker, and cleanly print a log message inside an empty running ROS2 node.
Here is the exact step-by-step execution plan.

---

## Step 1: Initialize the Python Environment using uv

Instead of using messy legacy virtual environments, we will use uv to initialize a modern, deterministic Python workspace.

1.  Create the python-ai-node directory.
2.  Initialize the project with uv:

uv init --app python-ai-node
cd python-ai-node

3.  Add our explicit dependencies to the pyproject.toml configuration:

uv add eclipse-zenoh pytest

(Note: We will not add rclpy via uv because ROS2 Jazzy packages are tied natively to the system Python environment inside our VirtualBox Ubuntu container. uv will be configured to inherit system packages). 4. Write a quick unit test using pytest to assert our domain command serialization logic before writing any pipeline code (TDD).

## Step 2: Establish the Python Skeleton (main.py)

We will write a clean, object-oriented script that boots up both a ROS2 Executor loop and a background Zenoh subscriber task.

1.  The ROS2 Node: Implement a minimal rclpy.node.Node subclass called PingReceiverNode. It will expose a logger interface.
2.  The Zenoh Fabric Connection: Initialize a Zenoh session that listens on the expression key fleet/robot/0/command.
3.  The Callback Bridge: Configure the Zenoh listener callback so that when a payload arrives, it safely passes the string directly to the ROS2 node's logging framework (node.get_logger().info()).
4.  Keep the ROS2 node spinning using a multi-threaded or single-threaded executor so it stays alive.

## Step 3: Scaffold the Rust Actix-web Gateway

Now we build our high-concurrency message broker using idiomatic, modern Rust (Edition 2021).

1.  Initialize the workspace: cargo new rust-gateway --bin
2.  Add core dependencies to Cargo.toml: actix-web, actix-ws, zenoh, tokio, serde, and serde_json.
3.  The Zenoh Publisher Module: Write a thread-safe wrapper that initializes a Zenoh session when the server starts and holds a reference to a Zenoh Publisher targeting fleet/robot/0/command.
4.  The Actix WebSocket Route: Implement an asynchronous /ws/teleop handler. When a frontend connection is upgraded to a WebSocket, Actix will spawn a task to listen for incoming stream frames.
5.  The Packet Mapping Loop: When a text frame containing a valid command payload arrives via the WebSocket, the Actix actor parses it using serde_json, extracts the domain payload, and publishes it instantly to the Zenoh fabric.

## Step 4: Build the Ultra-Lightweight Preact Frontend

We need a reactive web dashboard interface that won't lag when processing rapid real-time telemetry updates.

1.  Scaffold the project using Vite:

npm create vite@latest web-ui -- --template preact-ts
cd web-ui
npm install

2.  The WebSocket Hook (useWebSocket.ts): Write a clean TypeScript hook using standard browser WebSockets to maintain a persistent connection state to ws://localhost:8080/ws/teleop. Include reconnect logic.
3.  The UI Component: Create a dashboard view containing a simple button component: <button onClick={sendPing}>Trigger Robot Pulse</button>.
4.  Run the local dev server using npm run dev.

## Step 5: Containerize and Wire the Network Boundary

To ensure this runs smoothly on your hardware configuration (where the host runs the network and services are containerized), we will write a docker-compose.yml file to handle service orchestration.

1.  Network Configuration: Configure your containers to use network_mode: "host". This allows the Docker containers to seamlessly discover the Zenoh endpoints without complex port forwarding rules.
2.  Build the Dockerfiles for your React/Preact static server and your Actix Rust binary.
3.  Boot up the entire architecture infrastructure block:

docker-compose up --build

---

## The Integration Verification (The First End-to-End Test)

Once all five steps are up and running, you will verify your architectural skeleton:

1.  Open your browser to the local Preact web dashboard interface.
2.  Open a terminal directly inside your Ubuntu VirtualBox environment showing the streaming output logs of your Python automation script.
3.  Click the button in your web browser.
4.  Observe the data flow: The click triggers the Preact hook → sends a WebSocket frame to Actix → Actix transforms it into a Zenoh buffer → Zenoh routes it through the container network → the Python application intercepts it → the ROS2 node prints a clean [INFO] [PingReceiverNode]: Received Remote UI Command Pulse! directly to your console.

This proves our entire distributed engineering pipeline is fully functional. We have a robust, decoupled foundation, and we are ready to move on to Phase 2 to map out real, live physics telemetry.
Let me know which script we should write first to jump into Phase 1 code production:
The Python main.py script with the integrated rclpy node and Zenoh subscriber loopThe Rust Actix-web server layout with the WebSocket handling routing codeThe Preact Custom hook for managing TypeScript WebSocket lifecycles
