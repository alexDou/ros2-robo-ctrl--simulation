# Graph Report - ros2-robo-ctrl--simulation  (2026-09-11)

## Corpus Check
- 139 files · ~53,250 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 947 nodes · 1080 edges · 89 communities (55 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `09105652`
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
- implementation_wireframe.md
- template.sh
- DataFabricPort
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
- dev_phases.md
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
- HandSim
- teleop_ws
- inference_metrics
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
- robot_telemetry_event.schema.json
- EdgeNode
- error_frame.schema.json
- TeleopPage
- domain/contracts.ts
- structure.md
- scripts
- MockWebSocket

## God Nodes (most connected - your core abstractions)
1. `EdgeNode` - 18 edges
2. `compilerOptions` - 18 edges
3. `TeleopPage` - 14 edges
4. `DataFabricPort` - 12 edges
5. `ServiceHarness` - 12 edges
6. `template.sh script` - 11 edges
7. `teleop_ws()` - 11 edges
8. `MemoryFabric` - 10 edges
9. `robot_command_topic()` - 9 edges
10. `ZenohFabric` - 9 edges

## Surprising Connections (you probably didn't know these)
- `test_robot_command_malformed_fails_validation()` --uses--> `RobotCommand`  [INFERRED]
  tests/test_domain.py → src/domain/domain.py
- `test_robot_telemetry_event_malformed_fails()` --uses--> `RobotTelemetryEvent`  [INFERRED]
  tests/test_domain.py → src/domain/domain.py
- `test_edge_node_command_handling_malformed_payload()` --uses--> `EdgeNode`  [INFERRED]
  tests/test_edge_node.py → src/edge_node/node.py
- `test_robot_command_ping_serialization_round_trip()` --uses--> `CommandType`  [INFERRED]
  tests/test_domain.py → src/domain/domain.py
- `test_edge_node_command_handling_valid_ping()` --uses--> `CommandType`  [INFERRED]
  tests/test_edge_node.py → src/domain/domain.py

## Import Cycles
- None detected.

## Communities (89 total, 14 thin omitted)

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
Nodes (34): DOM, DOM.Iterable, domain, domain/contracts, ES2022, ../schemas/*, src, src/components/* (+26 more)

### Community 6 - "During the session"
Cohesion: 0.09
Nodes (19): ADR Format, Numbering, Optional sections, Template, What qualifies, When to offer an ADR, CONTEXT.md Format, Rules (+11 more)

### Community 7 - "devDependencies"
Cohesion: 0.06
Nodes (31): autoprefixer, @cucumber/cucumber, jsdom, oxlint, @playwright/test, postcss, @preact/preset-vite, tailwindcss (+23 more)

### Community 8 - "HTML Report Format"
Cohesion: 0.10
Nodes (18): Call-graph collapse, Candidate card, Cross-section (good for layered shallowness), Diagram patterns, Hand-built boxes-and-arrows (when Mermaid's layout fights you), Header, HTML Report Format, Mass diagram (good for "interface as wide as implementation") (+10 more)

### Community 9 - "implementation_wireframe.md"
Cohesion: 0.10
Nodes (17): Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py), Step 3: Scaffold the Rust Actix-web Gateway, Step 4: Build the Ultra-Lightweight Preact Frontend, Step 5: Containerize and Wire the Network Boundary, The Integration Verification (The First End-to-End Test), Step 1: Initialize the Python Environment using uv, Step 2: Establish the Python Skeleton (main.py) (+9 more)

### Community 10 - "template.sh"
Cohesion: 0.23
Nodes (17): ask(), ask_secret(), banner(), _clear(), _existing(), finish(), note(), open_url() (+9 more)

### Community 11 - "DataFabricPort"
Cohesion: 0.08
Nodes (33): HashMap, Into, Option, Receiver, RobotCommand, Sender, Session, DomainError (+25 more)

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
Cohesion: 0.46
Nodes (7): generate_python(), generate_rust(), generate_typescript(), load_schemas(), main(), Path, to_pascal_case()

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
Cohesion: 0.33
Nodes (5): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 31 - "Issue tracker: Beans CLI"
Cohesion: 0.33
Nodes (5): Conventions, Issue tracker: Beans CLI, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 32 - "dev_phases.md"
Cohesion: 0.33
Nodes (5): Phase 2: Frame Aggregation & Zero-State Telemetry, Phase 3: Physics Activation & 3D Spatial Mapping, Phase 4: Object Ingestion & AI Model Orchestration, Phase 5: Motion Trajectories & End-to-End Closing, Step-by-Step Prompts for Your AI Agent Harness

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

### Community 49 - "teleop_ws"
Cohesion: 0.09
Nodes (23): Data, Drop, HashSet, HttpRequest, HttpResponse, Payload, Responder, health_check() (+15 more)

### Community 50 - "inference_metrics"
Cohesion: 0.09
Nodes (22): confidence, detected_object, latency_ms, description, maximum, minimum, type, description (+14 more)

### Community 79 - "robot_command.schema.json"
Cohesion: 0.05
Nodes (37): command_id, EMERGENCY_STOP, payload, PING, RESET_FAULT, sender_id, TELEOP_JOINT_TARGET, TRAJECTORY_EXECUTE (+29 more)

### Community 80 - "robot_telemetry_event.schema.json"
Cohesion: 0.06
Nodes (34): BOOTING, EXECUTING, FAULT, IDLE, joint_positions, PROCESSING, robot_state, additionalProperties (+26 more)

### Community 81 - "EdgeNode"
Cohesion: 0.06
Nodes (43): Any, BaseModel, Enum, fixture, RobotTelemetryEvent, CommandType, ErrorFrame, InferenceMetrics (+35 more)

### Community 82 - "error_frame.schema.json"
Cohesion: 0.07
Nodes (28): error_code, message, additionalProperties, description, description, minLength, type, $id (+20 more)

### Community 83 - "TeleopPage"
Cohesion: 0.12
Nodes (9): TeleopPage, __dirname, __filename, HarnessConfig, ROOT_DIR, ServiceHarness, WEB_DIR, CustomWorld (+1 more)

### Community 84 - "domain/contracts.ts"
Cohesion: 0.11
Nodes (30): ArmJointPositions, CommandType, createPingCommand(), ErrorFrame, InferenceMetrics, isErrorFrame(), isRobotCommand(), isRobotTelemetryEvent() (+22 more)

### Community 86 - "scripts"
Cohesion: 0.10
Nodes (19): preact, three, urdf-loader, dependencies, preact, three, urdf-loader, name (+11 more)

## Knowledge Gaps
- **479 isolated node(s):** `rust_feedback.sh script`, `hand-sim-ai`, `$schema`, `$id`, `title` (+474 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 585 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `robot_telemetry_event.schema.json` to `inference_metrics`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `inference_metrics` connect `inference_metrics` to `robot_telemetry_event.schema.json`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `EdgeNode` (e.g. with `CommandType` and `RobotCommand`) actually correct?**
  _`EdgeNode` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `rust_feedback.sh script`, `hand-sim-ai`, `$schema` to the rest of the system?**
  _479 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Triage` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Issue tracker: GitHub` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `teach/SKILL.md` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._