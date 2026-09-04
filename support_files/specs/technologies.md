Comprehensive list of all technologies required for Distributed Cloud-Robotics Fleet Telemetry & Edge AI Ingestion Pipeline.

## 🛠️ Simulation Layer (Virtual Machine Host)

* Ubuntu Linux (24.04 LTS): The host OS running inside your VirtualBox environment.
* ROS2 Jazzy Jalisco: The latest stable long-term LTS middleware managing the robotics node communications ecosystem.
* Gazebo Harmonic (GZ Sim): The modern, refactored physics engine replacing legacy Gazebo, managing 3D kinematics and contact physics.
* MoveIt2: The motion planning framework handling kinematics and trajectory generation for the arm.
* Universal Robots ROS2 Driver (ur_simulation_gazebo): Official industry-standard open-source configuration files and meshes for the UR5e manipulator arm.

## 🐍 Edge AI Engine (Data Automation Layer)

* Python: The core scripting language for high-level automation loops and ROS2 interaction.
* uv: The modern, Rust-powered Python package installer and project manager. It completely replaces pip and virtualenv to manage your environment via pyproject.toml.
* ONNX Runtime (onnxruntime): Highly optimized, cross-platform engine executing deep learning inferences on your CPU or via OpenVINO.
* YOLOv8 Nano: A compressed, high-speed computer vision model file for extracting 2D/3D workspace bounding boxes.
* OpenCV (opencv-python): Used for processing image matrices from the robot camera before feeding them to the ONNX model.
* rclpy: Native ROS2 Python client library bindings.

## 🦀 Cloud & Edge Gateway (Backend Server Layer)

* Rust (Edition 2021+): Employs modern idioms: structured concurrency, type-safe error handling (Result/Option), and strict memory safety guarantees without a garbage collector.
* Actix-web: An enterprise-grade, actor-driven, asynchronous web server framework handling your public REST endpoints and web sockets.
* Tokio: The underlying multi-threaded async runtime managing long-lived background workers.
* serde & serde_json: The standard macro-driven framework for zero-copy serialization and deserialization of network data payloads.

## 📡 Inter-Process Communication (IPC Data Fabric)

* Eclipse Zenoh (zenoh for Rust, eclipse-zenoh for Python): A next-generation, ultra-low-overhead data fabric designed explicitly for robotics and edge computing. It bridges telemetry between Python and Rust seamlessly, passing through your container boundaries.

## 📊 Observability Interface (Frontend Web Dashboard)

* Preact: The hyper-lightweight (3KB), modern Virtual-DOM UI library used to process fast rendering loops without UI thread stutter.
* TypeScript: Enforces type safety matching your Rust backend models.
* Vite: The industry-standard frontend bundler orchestrating your development server.
* Three.js: Renders a fast 3D canvas representing live joint angles and object vectors in the operator's browser.
* TailwindCSS: Modern utility-first framework for responsive dashboard UI layout.

## ⚙️ Infrastructure & Testing (DevOps Layer)

* Docker & Docker Compose: Containerizes your React UI, Actix backend, and Python worker nodes.
* Cargo Test: The native Rust test engine running your domain-isolated unit and integration tests.
* PyTest: Used for verifying data transformations and structure mapping on the Python layer.
* Vitest: High-speed Vite-native test runner for your frontend Preact TDD verification tests.

------------------------------
We are fully aligned on the stack. Should we generate the structural configuration files next? I can output:

* The pyproject.toml managed by uv for the Python automation service
* The modern Cargo.toml dependencies block for your Actix-web backend
* The basic package.json file configuration for the Preact frontend setup
