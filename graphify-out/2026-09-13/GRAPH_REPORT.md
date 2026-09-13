# Graph Report - ros2-robo-ctrl--simulation  (2026-09-12)

## Corpus Check
- 169 files · ~79,772 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1265 nodes · 1548 edges · 125 communities (81 shown, 24 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9659899`
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
- phase2/implementation_wireframe.md
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
- HandSim Project Instructions
- Feature Development Protocol
- Pull Request Toolkit Playbook
- Domain Docs
- Issue tracker: Beans CLI
- phase2/overview.md
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
- arm-UR5e controller simulation
- robot_telemetry_event.schema.json
- sim-auditor.md
- rust_feedback.sh
- rules/graphify.md
- workflows/graphify.md
- agents/triage-labels.md
- README.md
- overview.md
- gateway
- hand-sim-ai
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
- phase1/implementation_wireframe.md
- inference_metrics
- hand-sim-1o1z--unit-21-edgenode-robust-jointstate-extraction-hybr.md
- hand-sim-6vku--unit-23-teleopclient-telemetrymonitor-showcase-dir.md
- hand-sim-awta--unit-20-domain-schemas-canonical-joint-constants-s.md
- hand-sim-iy13--unit-22-gateway-high-throughput-30-hz-telemetry-mu.md
- hand-sim-n9ch--unit-24-multi-service-30-hz-end-to-end-playwright.md
- EdgeNode
- RobotState
- .publish_tick
- test_edge_node.py
- domain/__init__.py
- dependencies
- robotLoader.ts
- joint_positions
- properties
- properties
- @cucumber/cucumber
- @playwright/test
- tailwindcss
- @testing-library/preact
- tsx
- @types/three
- typescript
- vite
- 0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping
- phase3/overview.md
- hand-sim-liyi--phase-3-3d-visualization-dynamic-kinematic-sync.md
- confidence
- hand-sim-2lcq--unit-32-teleopclient-threejs-robotvisualizer-canva.md
- hand-sim-2ved--unit-34-dynamic-motion-multi-service-integration-l.md
- hand-sim-alr9--unit-33-60-fps-telemetry-kinematic-synchronization.md
- hand-sim-ihmn--unit-31-edgenode-30-hz-continuous-sinusoidal-mock.md
- hand-sim-w74s--unit-30-urdf-model-extraction-static-mesh-asset-di.md
- main
- MockWebSocket

## God Nodes (most connected - your core abstractions)
1. `TeleopPage` - 27 edges
2. `EdgeNode` - 22 edges
3. `MockMotionPublisher` - 21 edges
4. `TelemetrySubscription` - 18 edges
5. `compilerOptions` - 18 edges
6. `DataFabricPort` - 13 edges
7. `RobotState` - 12 edges
8. `MemoryFabric` - 12 edges
9. `ServiceHarness` - 12 edges
10. `template.sh script` - 11 edges

## Surprising Connections (you probably didn't know these)
- `test_robot_command_malformed_fails_validation()` --uses--> `RobotCommand`  [INFERRED]
  tests/test_domain.py → src/domain/domain.py
- `test_edge_node_command_handling_malformed_payload()` --uses--> `EdgeNode`  [INFERRED]
  tests/test_edge_node.py → src/edge_node/node.py
- `test_edge_node_command_handling_valid_ping()` --uses--> `CommandType`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py
- `test_edge_node_zenoh_pub_sub_round_trip()` --uses--> `CommandType`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py
- `test_edge_node_command_handling_valid_ping()` --uses--> `RobotState`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py

## Import Cycles
- None detected.

## Communities (125 total, 24 thin omitted)

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

### Community 9 - "phase2/implementation_wireframe.md"
Cohesion: 0.05
Nodes (35): Phase 2: Frame Aggregation & Zero-State Telemetry, Phase 3: Physics Activation & 3D Spatial Mapping, Phase 4: Object Ingestion & AI Model Orchestration, Phase 5: Motion Trajectories & End-to-End Closing, Step-by-Step Prompts for Your AI Agent Harness, Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py), Step 3: Scaffold the Rust Actix-web Gateway (+27 more)

### Community 10 - "template.sh"
Cohesion: 0.23
Nodes (17): ask(), ask_secret(), banner(), _clear(), _existing(), finish(), note(), open_url() (+9 more)

### Community 11 - "TelemetrySubscription"
Cohesion: 0.06
Nodes (37): Box, Data, Debug, Deref, DerefMut, FnOnce, Formatter, HashMap (+29 more)

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
Cohesion: 0.24
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

### Community 27 - "HandSim Project Instructions"
Cohesion: 0.29
Nodes (6): Agent Skills & Tracking, Code Organization & Directory Invariants, Development Methodology, Domain Invariants, HandSim Project Instructions, System Architecture

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

### Community 50 - "robot_telemetry_event.schema.json"
Cohesion: 0.06
Nodes (33): elbow_joint, joint_positions, robot_state, shoulder_lift_joint, shoulder_pan_joint, wrist_1_joint, wrist_2_joint, wrist_3_joint (+25 more)

### Community 79 - "robot_command.schema.json"
Cohesion: 0.05
Nodes (39): command_id, EMERGENCY_STOP, payload, PING, RESET_FAULT, sender_id, TELEOP_JOINT_TARGET, TRAJECTORY_EXECUTE (+31 more)

### Community 80 - "enum"
Cohesion: 0.20
Nodes (10): BOOTING, EXECUTING, FAULT, IDLE, PROCESSING, robot_state, description, enum (+2 more)

### Community 81 - "MockMotionPublisher"
Cohesion: 0.11
Nodes (20): Node, RobotTelemetryEvent, Canonical schema for outbound telemetry events emitted by EdgeNode over…, JointSinusoidConfig, main(), MockMotionPublisher, Standalone continuous 30 Hz sinusoidal mock motion publisher for UR5e.…, Returns the most recent calculated joint positions (zero-order hold). (+12 more)

### Community 82 - "error_frame.schema.json"
Cohesion: 0.07
Nodes (28): error_code, message, additionalProperties, description, description, minLength, type, $id (+20 more)

### Community 83 - "TeleopPage"
Cohesion: 0.07
Nodes (9): TeleopPage, __dirname, __filename, HarnessConfig, ROOT_DIR, ServiceHarness, WEB_DIR, CustomWorld (+1 more)

### Community 84 - "contracts.ts"
Cohesion: 0.06
Nodes (55): ArmJointPositions, armJointPositionsSchema, CANONICAL_UR5E_JOINTS, CommandType, commandTypeSchema, DEFAULT_ROBOT_ID, ErrorFrame, errorFrameSchema (+47 more)

### Community 86 - "scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, build, dev, lint, preview, test (+4 more)

### Community 87 - "hand-sim-8n0g--phase-2-frame-aggregation-continuous-6-dof-telemet.md"
Cohesion: 0.25
Nodes (7): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Solution, Testing Decisions, User Stories

### Community 88 - "domain.rs"
Cohesion: 0.07
Nodes (35): D, HashSet, Into, Responder, deserialize_finite_joints(), DomainError, Error, Option (+27 more)

### Community 89 - "phase1/implementation_wireframe.md"
Cohesion: 0.25
Nodes (7): Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py), Step 3: Scaffold the Rust Actix-web Gateway, Step 4: Build the Ultra-Lightweight Preact Frontend, Step 5: Containerize and Wire the Network Boundary, The Integration Verification (The First End-to-End Test), Welcome to Phase 1: The "Ping" Pipeline. As a senior engineer, my goal isn't just to make a button click light up a terminal—it’s to establish our system's core network topology and data contracts. We are building a minimal, end-to-end, architectural skeleton.

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
Cohesion: 0.19
Nodes (8): EdgeNode, Any, RobotTelemetryEvent, Ingests a JointState ROS2 message and updates canonical joint positions. Args:…, Emits a periodic 30 Hz RobotTelemetryEvent with current joint positions., Ingests, validates, and processes an inbound RobotCommand payload string or…, Cleans up Zenoh subscriptions/sessions and ROS2 nodes., EdgeNode combining ROS2 node capabilities with Eclipse Zenoh DataFabric pub/sub.

### Community 97 - "RobotState"
Cohesion: 0.11
Nodes (24): BaseModel, Enum, CommandType, ErrorFrame, InferenceMetrics, parse_robot_topic(), robot_command_topic(), robot_telemetry_topic() (+16 more)

### Community 98 - ".publish_tick"
Cohesion: 0.23
Nodes (8): Any, RobotTelemetryEvent, Calculates deterministic joint angles clamped to physical limits [-pi, pi]., Calculates instantaneous joint velocities from analytical derivatives., Retrieves clock nanoseconds and ROS2 stamp struct in a single clock snapshot., Constructs a standard sensor_msgs/msg/JointState message., Constructs a typed RobotTelemetryEvent conforming to the wire contract., Publishes one synchronized 30 Hz step to both ROS2 and Zenoh.

### Community 99 - "test_edge_node.py"
Cohesion: 0.11
Nodes (19): JointState, RobotCommand, Canonical schema for inbound commands sent to EdgeNode over WebSocket or…, main(), MockJointStatePublisher, Standalone synthetic ROS2 JointState publisher at 30 Hz., ROS2 node publishing synthetic JointState messages at 30 Hz., Creates a synthetic JointState message with canonical joint names. (+11 more)

### Community 100 - "domain/__init__.py"
Cohesion: 0.15
Nodes (9): main(), CLI Entrypoint for EdgeNode process., JointStateMapper, Any, JointState extraction and mapping for canonical 6-DoF UR5e arm., Extracts canonical 6-DoF UR5e joint angles from ROS2 JointState messages.…, Returns the canonical 6-DoF joint positions in radians., Updates internal joint state from a sensor_msgs/msg/JointState or compatible… (+1 more)

### Community 101 - "dependencies"
Cohesion: 0.22
Nodes (9): preact, three, urdf-loader, dependencies, preact, three, urdf-loader, zod (+1 more)

### Community 102 - "robotLoader.ts"
Cohesion: 0.12
Nodes (20): ADR-0001, disposeMaterial(), getLatestPositions(), RobotVisualizer(), RobotVisualizerProps, applyJointPositions(), createRobotLoader(), DEFAULT_PACKAGE_MAP (+12 more)

### Community 103 - "joint_positions"
Cohesion: 0.22
Nodes (9): type, description, items, maxItems, minItems, prefixItems, title, type (+1 more)

### Community 104 - "properties"
Cohesion: 0.25
Nodes (8): description, type, properties, command_id, timestamp_ns, description, minimum, type

### Community 105 - "properties"
Cohesion: 0.22
Nodes (9): description, minLength, type, properties, description, minimum, type, detected_object (+1 more)

### Community 115 - "0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping"
Cohesion: 0.33
Nodes (5): 0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping, Consequences, Context, Decision, Status

### Community 117 - "hand-sim-liyi--phase-3-3d-visualization-dynamic-kinematic-sync.md"
Cohesion: 0.25
Nodes (7): Further Notes, Implementation Decisions, Out of Scope, Problem Statement, Solution, Testing Decisions, User Stories

### Community 118 - "confidence"
Cohesion: 0.40
Nodes (5): description, maximum, minimum, type, confidence

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

## Knowledge Gaps
- **595 isolated node(s):** `rust_feedback.sh script`, `hand-sim-ai`, `$schema`, `$id`, `title` (+590 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 763 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `properties` to `enum`, `robot_telemetry_event.schema.json`, `inference_metrics`, `joint_positions`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `EdgeNode` (e.g. with `CommandType` and `RobotCommand`) actually correct?**
  _`EdgeNode` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `MockMotionPublisher` (e.g. with `RobotState` and `RobotTelemetryEvent`) actually correct?**
  _`MockMotionPublisher` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `rust_feedback.sh script`, `hand-sim-ai`, `$schema` to the rest of the system?**
  _595 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Triage` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Issue tracker: GitHub` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `teach/SKILL.md` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._