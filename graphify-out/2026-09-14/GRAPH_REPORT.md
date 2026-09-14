# Graph Report - ros2-robo-ctrl--simulation  (2026-09-14)

## Corpus Check
- 181 files · ~98,435 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1550 nodes · 1951 edges · 158 communities (111 shown, 27 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `62c6afe3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Triage
- Issue tracker: GitHub
- teach/SKILL.md
- Process
- Codebase Design
- compilerOptions
- During the session
- devDependencies
- HTML Report Format
- Project Architecture Units (Vertical Walking Skeletons)
- template.sh
- TelemetrySubscription
- Diagnosing Bugs
- Test-Driven Development
- Process
- writing-for-agents/SKILL.md
- wayfinder/SKILL.md
- Ask Matt
- Cargo Workspace & Toolchain Orchestrator
- ROS2 Rust Development Conventions
- to-spec/SKILL.md
- generate_domain.py
- <Questionnaire title>
- hand-sim-e8n5--phase-1-distributed-telemetry-streaming-3d-teleope.md
- Agent Skill Generation Standard
- Process
- technologies.md
- ROS2 Robot Controller Simulation Project Instructions
- Feature Development Protocol
- Pull Request Toolkit Playbook
- Domain Docs
- Issue tracker: Beans CLI
- Implementation Decisions
- Telemetry Contract & Process Decoupling Guidelines
- REP 103 to Three.js Frame Alignment
- hand-sim-bplp--unit-12-gateway-actix-web-boundary-activesession-m.md
- hand-sim-h25q--unit-13-edgenode-ros2-node-datafabric-command-inge.md
- hand-sim-hadi--unit-15-playwright-end-to-end-suite-multi-service.md
- hand-sim-myia--unit-11-domain-schemas-datafabric-contract-baselin.md
- hand-sim-qxif--unit-14-teleopclient-ping-pong-interface-real-time.md
- Idiomatic Rust Architecture Guidelines
- Code Simplification Playbook
- hitl-loop.template.sh
- GLOSSARY.md Format
- URDF & Three.js Web Synchronization
- Specification-Driven Development (SDD) blueprint.
- code-reviewer.md
- trim_logs.sh
- ROS2 Robot Controller Simulation
- ROS2 Robot Controller Simulation
- robot_telemetry_event.schema.json
- sim-auditor.md
- rust_feedback.sh
- rules/graphify.md
- workflows/graphify.md
- agents/triage-labels.md
- README.md
- RobotState
- gateway
- ActiveSessionRegistry
- robot_command.schema.json
- enum
- MockMotionPublisher
- error_frame.schema.json
- TeleopPage
- contracts.ts
- structure.md
- scripts
- hand-sim-8n0g--phase-2-frame-aggregation-continuous-6-dof-telemet.md
- domain.rs
- TeleopClient.tsx
- inference_metrics
- hand-sim-1o1z--unit-21-edgenode-robust-jointstate-extraction-hybr.md
- hand-sim-6vku--unit-23-teleopclient-telemetrymonitor-showcase-dir.md
- hand-sim-awta--unit-20-domain-schemas-canonical-joint-constants-s.md
- hand-sim-iy13--unit-22-gateway-high-throughput-30-hz-telemetry-mu.md
- hand-sim-n9ch--unit-24-multi-service-30-hz-end-to-end-playwright.md
- EdgeNode
- domain.py
- unit2/implementation_wireframe.md
- test_edge_node.py
- JointStateMapper
- dependencies
- robotLoader.ts
- TelemetryMonitor.test.tsx
- palm_state
- unit3/implementation_wireframe.md
- @cucumber/cucumber
- @playwright/test
- tailwindcss
- @testing-library/preact
- tsx
- @types/three
- typescript
- vite
- 0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping
- PalmAction
- hand-sim-liyi--phase-3-3d-visualization-dynamic-kinematic-sync.md
- main.tsx
- hand-sim-2lcq--unit-32-teleopclient-threejs-robotvisualizer-canva.md
- hand-sim-2ved--unit-34-dynamic-motion-multi-service-integration-l.md
- hand-sim-alr9--unit-33-60-fps-telemetry-kinematic-synchronization.md
- hand-sim-ihmn--unit-31-edgenode-30-hz-continuous-sinusoidal-mock.md
- hand-sim-w74s--unit-30-urdf-model-extraction-static-mesh-asset-di.md
- main
- ros2-robot-controller-simulation
- unit1/implementation_wireframe.md
- unit4/implementation_wireframe.md
- steps.md
- dev_phases.md
- hand-sim-8t28--unit-43-gateway-safety-gating-20-hz-command-thrott.md
- hand-sim-cujn--unit-45-closed-loop-multi-service-integration-suit.md
- hand-sim-cxnx--unit-44-teleopclient-operator-toolbar-lifecycle-co.md
- hand-sim-gvq7--unit-42-edgenode-lifecycle-state-machine-singlecom.md
- hand-sim-kiai--unit-40-domain-schemas-palm-actuation-contracts.md
- hand-sim-osnb--unit-41-dexterous-palm-3d-model-kinematic-flange-m.md
- emergency_stop_payload
- unit1/overview.md
- unit2/overview.md
- unit3/overview.md
- unit4/overview.md
- pose_name
- action
- palm_actuate_payload
- items
- MockWebSocket
- properties
- reset_fault_payload
- trajectory_execute_payload
- waypoints
- joint_positions
- properties
- confidence
- is_grasped
- PoseName
- world.ts
- ServiceHarness
- harness.ts

## God Nodes (most connected - your core abstractions)
1. `TeleopPage` - 40 edges
2. `EdgeNode` - 36 edges
3. `MockMotionPublisher` - 21 edges
4. `RobotState` - 18 edges
5. `TelemetrySubscription` - 18 edges
6. `compilerOptions` - 18 edges
7. `ServiceHarness` - 15 edges
8. `CommandType` - 13 edges
9. `RobotCommand` - 13 edges
10. `DataFabricPort` - 13 edges

## Surprising Connections (you probably didn't know these)
- `test_edge_node_command_handling_malformed_payload()` --uses--> `EdgeNode`  [INFERRED]
  tests/test_edge_node.py → src/edge_node/node.py
- `test_palm_actuate_payload_serialization()` --uses--> `PalmAction`  [INFERRED]
  tests/test_domain.py → src/domain/domain.py
- `test_edge_node_canned_trajectory_execution()` --uses--> `PoseName`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py
- `test_edge_node_joint_state_subscription_and_streaming()` --uses--> `RobotState`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py
- `test_edge_node_lifecycle_initial_state()` --uses--> `RobotState`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py

## Import Cycles
- None detected.

## Communities (158 total, 27 thin omitted)

### Community 0 - "Triage"
Cohesion: 0.06
Nodes (29): Bad agent brief, Behavioral, not procedural, Complete acceptance criteria, Durability over precision, Examples, Explicit scope boundaries, Good agent brief (bug), Good agent brief (enhancement) (+21 more)

### Community 1 - "Issue tracker: GitHub"
Cohesion: 0.07
Nodes (24): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary, Conventions, Issue tracker: GitHub, Pull requests as a triage surface (+16 more)

### Community 2 - "teach/SKILL.md"
Cohesion: 0.07
Nodes (25): Learning Record Format, Numbering, Optional sections, Supersession, Template, What does _not_ qualify, When to write a learning record, MISSION.md Format (+17 more)

### Community 3 - "Process"
Cohesion: 0.07
Nodes (25): 1. State the question, 2. Isolate the logic in a portable module, 3. Build the shareable HTML file, 4. Hand it over, 5. Capture the answer and the prototype, Anti-patterns, Logic Prototype, Process (+17 more)

### Community 4 - "Codebase Design"
Cohesion: 0.09
Nodes (21): 1. In-process, 2. Local-substitutable, 3. Remote but owned (Ports & Adapters), 4. True external (Mock), Deepening, Dependency categories, Seam discipline, Testing strategy: replace, don't layer (+13 more)

### Community 5 - "compilerOptions"
Cohesion: 0.06
Nodes (35): DOM, DOM.Iterable, domain/*, domain/contracts, domain/index, ES2022, ../schemas/*, src (+27 more)

### Community 6 - "During the session"
Cohesion: 0.09
Nodes (19): ADR Format, Numbering, Optional sections, Template, What qualifies, When to offer an ADR, CONTEXT.md Format, Rules (+11 more)

### Community 7 - "devDependencies"
Cohesion: 0.13
Nodes (15): autoprefixer, jsdom, oxlint, postcss, @preact/preset-vite, @types/node, vitest, devDependencies (+7 more)

### Community 8 - "HTML Report Format"
Cohesion: 0.10
Nodes (18): Call-graph collapse, Candidate card, Cross-section (good for layered shallowness), Diagram patterns, Hand-built boxes-and-arrows (when Mermaid's layout fights you), Header, HTML Report Format, Mass diagram (good for "interface as wide as implementation") (+10 more)

### Community 9 - "Project Architecture Units (Vertical Walking Skeletons)"
Cohesion: 0.11
Nodes (17): Project Architecture Units (Vertical Walking Skeletons), Specification & Ticket Breakdown Protocol: Contract-First Staging, Sub-Unit Breakdown, Sub-Unit Breakdown, Sub-Unit Breakdown, Sub-Unit Breakdown, Sub-Unit Breakdown, Sub-Unit Breakdown (+9 more)

### Community 10 - "template.sh"
Cohesion: 0.23
Nodes (17): ask(), ask_secret(), banner(), _clear(), _existing(), finish(), note(), open_url() (+9 more)

### Community 11 - "TelemetrySubscription"
Cohesion: 0.06
Nodes (39): Box, Data, Debug, Deref, DerefMut, FnOnce, Formatter, HashMap (+31 more)

### Community 12 - "Diagnosing Bugs"
Cohesion: 0.13
Nodes (14): Completion criterion: a tight loop that goes red, Diagnosing Bugs, Minimise, Non-deterministic bugs, Phase 1: Build a feedback loop, Phase 2: Reproduce + minimise, Phase 3: Hypothesise, Phase 4: Instrument (+6 more)

### Community 13 - "Test-Driven Development"
Cohesion: 0.15
Nodes (10): Designing for Mockability, When to Mock, Anti-patterns, Rules of the loop, Seams: where tests go, Test-Driven Development, What a good test is, Bad Tests (+2 more)

### Community 14 - "Process"
Cohesion: 0.15
Nodes (12): 1. Gather context, 2. Explore the codebase (optional), 3. Draft vertical slices, 4. Quiz the user, 5. Publish the tickets to the configured tracker, Acceptance criteria, Blocked by, <NN>: <Ticket title> (+4 more)

### Community 15 - "writing-for-agents/SKILL.md"
Cohesion: 0.15
Nodes (11): Context pointers, Information hierarchy, Leading words, Invocation, Router skills, Skill mechanics, Splitting by invocation, Pruning (+3 more)

### Community 16 - "wayfinder/SKILL.md"
Cohesion: 0.17
Nodes (11): Chart the map, Fog of war, Invocation, Out of scope, Plan, don't do, Refer by name, The Map, The map body (+3 more)

### Community 17 - "Ask Matt"
Cohesion: 0.20
Nodes (9): Ask Matt, Codebase health, Context hygiene, On-ramps, Phase boundaries, Precondition, Standalone, The main flow: idea → ship (+1 more)

### Community 18 - "Cargo Workspace & Toolchain Orchestrator"
Cohesion: 0.20
Nodes (9): 1. Two-Tier Workspace Topography, 2. Manifest Dual-Sync Rule (`Cargo.toml` ⇄ `package.xml`), 3. Toolchain Execution Playbook, 4. Diagnostics & Common Failure Recovery, A. Testing via `cargo-nextest`, B. Workspace Audits & Dependency Hygiene, C. Colcon vs. Cargo Separation of Concerns, Cargo Workspace & Toolchain Orchestrator (+1 more)

### Community 19 - "ROS2 Rust Development Conventions"
Cohesion: 0.22
Nodes (8): Build System Architecture, `Cargo.toml`, Configuration Files, Node Implementation Pattern (`src/main.rs`), `package.xml`, Project File Layout, Quality Guardrails, ROS2 Rust Development Conventions

### Community 20 - "to-spec/SKILL.md"
Cohesion: 0.22
Nodes (8): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Process, Solution, Testing Decisions, User Stories

### Community 21 - "generate_domain.py"
Cohesion: 0.25
Nodes (17): ConstantDef, DomainIR, emit_python(), emit_rust(), emit_typescript(), EnumDef, FieldDef, FixedArrayDef (+9 more)

### Community 22 - "<Questionnaire title>"
Cohesion: 0.25
Nodes (7): Anything else?, Context, Document structure, How to answer, <Questionnaire title>, <Theme heading>, What load is the system expected to handle at launch?

### Community 23 - "hand-sim-e8n5--phase-1-distributed-telemetry-streaming-3d-teleope.md"
Cohesion: 0.25
Nodes (7): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Solution, Testing Decisions, User Stories

### Community 24 - "Agent Skill Generation Standard"
Cohesion: 0.29
Nodes (6): Agent Skill Generation Standard, Body Composition Template, Core Philosophy, Frontmatter Schema Requirements, Skill Directory Layout, Trigger Hygiene

### Community 25 - "Process"
Cohesion: 0.29
Nodes (6): 1. Scope the procedure, 2. Map each stage's journey, 3. Author the wizard, 4. Verify and hand off, Process, Wizard

### Community 26 - "technologies.md"
Cohesion: 0.29
Nodes (6): 🦀 Cloud & Edge Gateway (Backend Server Layer), 🐍 Edge AI Engine (Data Automation Layer), ⚙️ Infrastructure & Testing (DevOps Layer), 📡 Inter-Process Communication (IPC Data Fabric), 📊 Observability Interface (Frontend Web Dashboard), 🛠️ Simulation Layer (Virtual Machine Host)

### Community 27 - "ROS2 Robot Controller Simulation Project Instructions"
Cohesion: 0.29
Nodes (6): Agent Skills & Tracking, Code Organization & Directory Invariants, Development Methodology, Domain Invariants, ROS2 Robot Controller Simulation Project Instructions, System Architecture

### Community 28 - "Feature Development Protocol"
Cohesion: 0.33
Nodes (5): Feature Development Protocol, Phase 1: Discovery & Technical Grilling, Phase 2: Codebase Exploration & Impact Analysis, Phase 3: Architectural RFC & Spec, Phase 4: Test-First Task Matrix

### Community 29 - "Pull Request Toolkit Playbook"
Cohesion: 0.33
Nodes (5): 1. Tooling Prerequisites, 2. Pre-Flight Gate (Must Pass Before PR Creation), 3. Pull Request Body Standard, 4. Review Evaluation Criteria (For Reviewing External PRs), Pull Request Toolkit Playbook

### Community 30 - "Domain Docs"
Cohesion: 0.29
Nodes (6): Before exploring, read these, Contract-First Staged Workflow, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 31 - "Issue tracker: Beans CLI"
Cohesion: 0.33
Nodes (5): Conventions, Issue tracker: Beans CLI, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 32 - "Implementation Decisions"
Cohesion: 0.09
Nodes (21): 1. Architectural Tier Boundaries & Clean Module Decomposition, 2. Domain Schema & Actuation Contracts, 3. EdgeNode Lifecycle State Machine & SingleCommandGating, 4. Dexterous Palm Procedural 3D Model & Kinematic Synchronization, 5. Canned Trajectories & Motion Simulation, 6. Gateway 20 Hz Throttling, 7. TeleopClient Operator Toolbar & Error UX, Distributed Transport & Robustness (+13 more)

### Community 33 - "Telemetry Contract & Process Decoupling Guidelines"
Cohesion: 0.40
Nodes (4): Decoupled Process Boundary, Domain Schema: RobotTelemetryEvent, Invariants & TDD, Telemetry Contract & Process Decoupling Guidelines

### Community 34 - "REP 103 to Three.js Frame Alignment"
Cohesion: 0.40
Nodes (4): Coordinate Conventions, Position Translation, REP 103 to Three.js Frame Alignment, Rotation and URDF Alignment Rules

### Community 35 - "hand-sim-bplp--unit-12-gateway-actix-web-boundary-activesession-m.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Verification Summary, What to build

### Community 36 - "hand-sim-h25q--unit-13-edgenode-ros2-node-datafabric-command-inge.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Verification Summary, What to build

### Community 37 - "hand-sim-hadi--unit-15-playwright-end-to-end-suite-multi-service.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 38 - "hand-sim-myia--unit-11-domain-schemas-datafabric-contract-baselin.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 39 - "hand-sim-qxif--unit-14-teleopclient-ping-pong-interface-real-time.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Verification Summary, What to build

### Community 40 - "Idiomatic Rust Architecture Guidelines"
Cohesion: 0.40
Nodes (4): Idiomatic Rust Architecture Guidelines, Invariant Safety vs. Operational Errors, Real-Time Constraints & Allocations (ROS2 / Simulation), Target Configuration & Pre-Flight Verification

### Community 41 - "Code Simplification Playbook"
Cohesion: 0.50
Nodes (3): Code Simplification Playbook, Invariant Verification Workflow, Principles of Simplification

### Community 42 - "hitl-loop.template.sh"
Cohesion: 0.83
Nodes (3): capture(), hitl-loop.template.sh script, step()

### Community 43 - "GLOSSARY.md Format"
Cohesion: 0.50
Nodes (3): GLOSSARY.md Format, Rules, Structure

### Community 44 - "URDF & Three.js Web Synchronization"
Cohesion: 0.50
Nodes (3): 1. URDF Loading & Mesh Path Resolution, Architecture Overview, URDF & Three.js Web Synchronization

### Community 45 - "Specification-Driven Development (SDD) blueprint."
Cohesion: 0.50
Nodes (3): AI Agent Execution Directive & Constraints, Domain Definitions & Serialization Contracts (DDD Baseline), Specification-Driven Development (SDD) blueprint.

### Community 49 - "ROS2 Robot Controller Simulation"
Cohesion: 0.06
Nodes (31): 1. Executive Summary & System Overview, 1. Inbound Command: `RobotCommand` (`schemas/robot_command.schema.json`), 2.1 The Manipulator: Universal Robots UR5e (URe5), 2.2 End-Effector: Dexterous Palm & Hand Integration, 2.3 Coordinate Frame Conventions & Alignment, 2. Outbound Telemetry Event: `RobotTelemetryEvent` (`schemas/robot_telemetry_event.schema.json`), 2. Simulated Hardware & Kinematics, 3. Diagnostic Error Frame: `ErrorFrame` (`schemas/error_frame.schema.json`) (+23 more)

### Community 50 - "robot_telemetry_event.schema.json"
Cohesion: 0.06
Nodes (34): elbow_joint, joint_positions, palm_state, robot_state, shoulder_lift_joint, shoulder_pan_joint, wrist_1_joint, wrist_2_joint (+26 more)

### Community 57 - "RobotState"
Cohesion: 0.17
Nodes (20): CommandType, RobotCommand, RobotState, RobotTelemetryEvent, Canonical schema for inbound commands sent to EdgeNode over WebSocket or…, Canonical schema for outbound telemetry events emitted by EdgeNode over…, Operational command type, Current lifecycle state of the robotic manipulator (+12 more)

### Community 77 - "ActiveSessionRegistry"
Cohesion: 0.17
Nodes (13): HashSet, Responder, health_check(), main(), Result, ActiveSessionGuard, ActiveSessionRegistry, Arc (+5 more)

### Community 79 - "robot_command.schema.json"
Cohesion: 0.05
Nodes (40): command_id, EMERGENCY_STOP, PALM_ACTUATE, payload, PING, RESET_FAULT, sender_id, TELEOP_JOINT_TARGET (+32 more)

### Community 80 - "enum"
Cohesion: 0.20
Nodes (10): BOOTING, EXECUTING, FAULT, IDLE, PROCESSING, robot_state, description, enum (+2 more)

### Community 81 - "MockMotionPublisher"
Cohesion: 0.08
Nodes (26): Node, JointSinusoidConfig, main(), MockMotionPublisher, Any, RobotTelemetryEvent, Standalone continuous 30 Hz sinusoidal mock motion publisher for UR5e.…, Calculates deterministic joint angles clamped to physical limits [-pi, pi]. (+18 more)

### Community 82 - "error_frame.schema.json"
Cohesion: 0.07
Nodes (28): error_code, message, additionalProperties, description, description, minLength, type, $id (+20 more)

### Community 84 - "contracts.ts"
Cohesion: 0.06
Nodes (49): armJointPositionsSchema, commandTypeSchema, EmergencyStopPayload, emergencyStopPayloadSchema, errorFrameSchema, InferenceMetrics, inferenceMetricsSchema, isRobotCommand() (+41 more)

### Community 86 - "scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, build, dev, lint, preview, test (+4 more)

### Community 87 - "hand-sim-8n0g--phase-2-frame-aggregation-continuous-6-dof-telemet.md"
Cohesion: 0.25
Nodes (7): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Solution, Testing Decisions, User Stories

### Community 88 - "domain.rs"
Cohesion: 0.08
Nodes (31): D, Into, canonical_pose(), deserialize_finite_joints(), DomainError, Error, Option, Result (+23 more)

### Community 89 - "TeleopClient.tsx"
Cohesion: 0.22
Nodes (18): CommandType, ErrorFrame, isErrorFrame(), PalmAction, RobotCommand, RobotTelemetryEvent, serializeCommand(), createEmergencyStopCommand() (+10 more)

### Community 90 - "inference_metrics"
Cohesion: 0.22
Nodes (9): confidence, detected_object, latency_ms, additionalProperties, description, required, title, type (+1 more)

### Community 91 - "hand-sim-1o1z--unit-21-edgenode-robust-jointstate-extraction-hybr.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 92 - "hand-sim-6vku--unit-23-teleopclient-telemetrymonitor-showcase-dir.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 93 - "hand-sim-awta--unit-20-domain-schemas-canonical-joint-constants-s.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 94 - "hand-sim-iy13--unit-22-gateway-high-throughput-30-hz-telemetry-mu.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 95 - "hand-sim-n9ch--unit-24-multi-service-30-hz-end-to-end-playwright.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 96 - "EdgeNode"
Cohesion: 0.20
Nodes (10): ErrorFrame, PalmAction, EdgeNode, Any, RobotTelemetryEvent, Ingests a JointState ROS2 message and updates canonical joint positions. Args:…, Emits a periodic 30 Hz RobotTelemetryEvent with current joint positions., Ingests, validates, and processes an inbound RobotCommand payload string or… (+2 more)

### Community 97 - "domain.py"
Cohesion: 0.11
Nodes (23): BaseModel, EmergencyStopPayload, ErrorFrame, InferenceMetrics, PalmActuatePayload, PalmState, parse_robot_topic(), ResetFaultPayload (+15 more)

### Community 98 - "unit2/implementation_wireframe.md"
Cohesion: 0.22
Nodes (8): Contract-First Parallel Execution Model, Ready to Begin Implementation, Step 1: Named JointState Extractor & Hybrid Mock Publisher (EdgeNode / Python), Step 2: Continuous 30 Hz Telemetry Streaming Loop (EdgeNode / Python), Step 3: Gateway Stream Multiplexing & High-Throughput Forwarding (Gateway / Rust), Step 4: Non-Reactive Ingestion & Direct DOM Painting (TeleopClient / Preact), Step 5: Cross-Language Schema Alignment & Boundary Validation, The Integration Verification (The Continuous Telemetry Test)

### Community 99 - "test_edge_node.py"
Cohesion: 0.12
Nodes (16): JointState, main(), MockJointStatePublisher, Standalone synthetic ROS2 JointState publisher at 30 Hz., ROS2 node publishing synthetic JointState messages at 30 Hz., Creates a synthetic JointState message with canonical joint names., Publishes a single JointState message and returns it., mock_ros_node() (+8 more)

### Community 100 - "JointStateMapper"
Cohesion: 0.13
Nodes (10): main(), CLI Entrypoint for EdgeNode process., JointStateMapper, Any, JointState extraction and mapping for canonical 6-DoF UR5e arm., Extracts canonical 6-DoF UR5e joint angles from ROS2 JointState messages.…, Returns the canonical 6-DoF joint positions in radians., Updates internal joint state from a sensor_msgs/msg/JointState or compatible… (+2 more)

### Community 101 - "dependencies"
Cohesion: 0.22
Nodes (9): preact, three, urdf-loader, dependencies, preact, three, urdf-loader, zod (+1 more)

### Community 102 - "robotLoader.ts"
Cohesion: 0.11
Nodes (24): ADR-0001, UR5E_JOINTS, UR5eJoint, createDexterousPalm(), disposeMaterial(), getLatestPositions(), PalmProceduralAssets, RobotVisualizer() (+16 more)

### Community 103 - "TelemetryMonitor.test.tsx"
Cohesion: 0.27
Nodes (9): ArmJointPositions, CANONICAL_UR5E_JOINTS, isRobotTelemetryEvent(), RobotState, TelemetryMonitor(), TelemetryMonitorProps, TelemetryBuffer, useTelemetryStream() (+1 more)

### Community 104 - "palm_state"
Cohesion: 0.22
Nodes (9): is_grasped, is_grasped, additionalProperties, default, description, required, title, type (+1 more)

### Community 105 - "unit3/implementation_wireframe.md"
Cohesion: 0.22
Nodes (8): Contract-First Parallel Execution Model, Ready to Begin Implementation, Step 1: URDF Model Extraction & Static Asset Distribution (Unit 3.0), Step 2: EdgeNode 30 Hz Continuous Sinusoidal Mock Motion Publisher (Unit 3.1), Step 3: TeleopClient Three.js RobotVisualizer Canvas & Scene Infrastructure (Unit 3.2), Step 4: 60 FPS Telemetry Kinematic Synchronization & REP-103 Frame Alignment (Unit 3.3), Step 5: Dynamic Multi-Service Integration & Latency Suite (Unit 3.4), The Integration Verification (The Dynamic 3D Spatial Sync Test)

### Community 115 - "0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping"
Cohesion: 0.33
Nodes (5): 0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping, Consequences, Context, Decision, Status

### Community 116 - "PalmAction"
Cohesion: 0.25
Nodes (9): Enum, PalmAction, PoseName, TrajectoryExecutePayload, Actuation action to execute on dexterous palm, Pre-defined canonical UR5e posture, Typed payload for TRAJECTORY_EXECUTE command dispatching canned or custom…, str (+1 more)

### Community 117 - "hand-sim-liyi--phase-3-3d-visualization-dynamic-kinematic-sync.md"
Cohesion: 0.25
Nodes (7): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Solution, Testing Decisions, User Stories

### Community 118 - "main.tsx"
Cohesion: 0.29
Nodes (6): DEFAULT_ROBOT_ID, App(), root, isBrowser(), getAllParams(), getParam()

### Community 119 - "hand-sim-2lcq--unit-32-teleopclient-threejs-robotvisualizer-canva.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 120 - "hand-sim-2ved--unit-34-dynamic-motion-multi-service-integration-l.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 121 - "hand-sim-alr9--unit-33-60-fps-telemetry-kinematic-synchronization.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 122 - "hand-sim-ihmn--unit-31-edgenode-30-hz-continuous-sinusoidal-mock.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 123 - "hand-sim-w74s--unit-30-urdf-model-extraction-static-mesh-asset-di.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 124 - "main"
Cohesion: 0.67
Nodes (5): find_ros_package_share(), generate_raw_urdf(), main(), Path, strip_physics_and_clean_urdf()

### Community 126 - "unit1/implementation_wireframe.md"
Cohesion: 0.25
Nodes (7): Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py), Step 3: Scaffold the Rust Actix-web Gateway, Step 4: Build the Ultra-Lightweight Preact Frontend, Step 5: Containerize and Wire the Network Boundary, The Integration Verification (The First End-to-End Test), Welcome to Phase 1: The "Ping" Pipeline. As a senior engineer, my goal isn't just to make a button click light up a terminal—it’s to establish our system's core network topology and data contracts. We are building a minimal, end-to-end, architectural skeleton.

### Community 127 - "unit4/implementation_wireframe.md"
Cohesion: 0.25
Nodes (7): Contract-First Parallel Execution Model, Step 1: Domain Schemas & Palm Actuation Contracts (Unit 4.0), Step 2: Dexterous Palm 3D Model & Kinematic Flange Mounting (Unit 4.1), Step 3: EdgeNode Lifecycle State Machine & ROS2 Controller Dispatch (Unit 4.2), Step 4: Gateway Safety Gating & 20 Hz Command Throttling (Unit 4.3), Step 5: TeleopClient Operator Toolbar & Controls (Unit 4.4), Step 6: Closed-Loop Multi-Service Integration Suite (Unit 4.5)

### Community 128 - "steps.md"
Cohesion: 0.29
Nodes (6): Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py), Step 3: Scaffold the Rust Actix-web Gateway, Step 4: Build the Ultra-Lightweight Preact Frontend, Step 5: Containerize and Wire the Network Boundary, The Integration Verification (The First End-to-End Test)

### Community 129 - "dev_phases.md"
Cohesion: 0.33
Nodes (5): Phase 2: Frame Aggregation & Zero-State Telemetry, Phase 3: Physics Activation & 3D Spatial Mapping, Phase 4: Object Ingestion & AI Model Orchestration, Phase 5: Motion Trajectories & End-to-End Closing, Step-by-Step Prompts for Your AI Agent Harness

### Community 130 - "hand-sim-8t28--unit-43-gateway-safety-gating-20-hz-command-thrott.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Summary of Changes, What to build

### Community 131 - "hand-sim-cujn--unit-45-closed-loop-multi-service-integration-suit.md"
Cohesion: 0.40
Nodes (4): Acceptance criteria, Blocked by, Parent, What to build

### Community 132 - "hand-sim-cxnx--unit-44-teleopclient-operator-toolbar-lifecycle-co.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Summary of Changes, What to build

### Community 133 - "hand-sim-gvq7--unit-42-edgenode-lifecycle-state-machine-singlecom.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Summary of Changes, What to build

### Community 134 - "hand-sim-kiai--unit-40-domain-schemas-palm-actuation-contracts.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Summary of Changes, What to build

### Community 135 - "hand-sim-osnb--unit-41-dexterous-palm-3d-model-kinematic-flange-m.md"
Cohesion: 0.33
Nodes (5): Acceptance criteria, Blocked by, Parent, Summary of Changes, What to build

### Community 136 - "emergency_stop_payload"
Cohesion: 0.20
Nodes (10): $defs, emergency_stop_payload, additionalProperties, description, properties, title, type, reason (+2 more)

### Community 141 - "pose_name"
Cohesion: 0.22
Nodes (9): HOME, INSPECT_POSE, READY, description, enum, title, type, pose_name (+1 more)

### Community 142 - "action"
Cohesion: 0.25
Nodes (8): GRASP, RELEASE, description, enum, title, type, properties, action

### Community 143 - "palm_actuate_payload"
Cohesion: 0.29
Nodes (7): action, palm_actuate_payload, additionalProperties, description, required, title, type

### Community 144 - "items"
Cohesion: 0.33
Nodes (7): description, items, maxItems, minItems, title, type, items

### Community 146 - "properties"
Cohesion: 0.22
Nodes (9): description, minLength, type, properties, description, minimum, type, detected_object (+1 more)

### Community 147 - "reset_fault_payload"
Cohesion: 0.33
Nodes (6): reset_fault_payload, additionalProperties, description, properties, title, type

### Community 148 - "trajectory_execute_payload"
Cohesion: 0.40
Nodes (5): trajectory_execute_payload, additionalProperties, description, title, type

### Community 149 - "waypoints"
Cohesion: 0.50
Nodes (4): waypoints, description, title, type

### Community 150 - "joint_positions"
Cohesion: 0.22
Nodes (9): type, description, items, maxItems, minItems, prefixItems, title, type (+1 more)

### Community 151 - "properties"
Cohesion: 0.25
Nodes (8): description, type, properties, command_id, timestamp_ns, description, minimum, type

### Community 152 - "confidence"
Cohesion: 0.40
Nodes (5): description, maximum, minimum, type, confidence

### Community 153 - "is_grasped"
Cohesion: 0.40
Nodes (5): default, description, type, properties, is_grasped

### Community 154 - "PoseName"
Cohesion: 0.67
Nodes (3): PoseName, OperatorToolbar(), OperatorToolbarProps

### Community 155 - "world.ts"
Cohesion: 0.36
Nodes (3): CANONICAL_POSES, CustomWorld, ICustomWorld

### Community 157 - "harness.ts"
Cohesion: 0.33
Nodes (5): __dirname, __filename, HarnessConfig, ROOT_DIR, WEB_DIR

## Knowledge Gaps
- **734 isolated node(s):** `rust_feedback.sh script`, `ros2-robot-controller-simulation`, `$schema`, `$id`, `title` (+729 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 936 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `properties` to `palm_state`, `enum`, `robot_telemetry_event.schema.json`, `joint_positions`, `inference_metrics`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `EdgeNode` connect `EdgeNode` to `domain.py`, `test_edge_node.py`, `JointStateMapper`, `PalmAction`, `RobotState`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `$defs` connect `emergency_stop_payload` to `palm_actuate_payload`, `reset_fault_payload`, `trajectory_execute_payload`, `robot_command.schema.json`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `EdgeNode` (e.g. with `CommandType` and `ErrorFrame`) actually correct?**
  _`EdgeNode` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `MockMotionPublisher` (e.g. with `RobotState` and `RobotTelemetryEvent`) actually correct?**
  _`MockMotionPublisher` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `RobotState` (e.g. with `MockMotionPublisher` and `EdgeNode`) actually correct?**
  _`RobotState` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `rust_feedback.sh script`, `ros2-robot-controller-simulation`, `$schema` to the rest of the system?**
  _734 weakly-connected nodes found - possible documentation gaps or missing edges._