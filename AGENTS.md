# ROS2 Robot Controller Simulation Project Instructions

## System Architecture

Decoupled three-tier distributed architecture following Clean Architecture & Ousterhout Deep Modules:

- **Web Visualizer (`web/`)**: Preact + Vite + Three.js (`urdf-loader`) + Vitest. Linted via OXC (`oxlint`), formatted via Prettier.
- **Gateway (`src/gateway/`)**: Actix-Web WebSocket service. Encapsulates Zenoh session behind deep port facade. Enforces single active session per robot (`409 Conflict` on duplicate). Translates WebSocket frames ↔ Zenoh expressions.
- **ROS2 Subsystem (`src/ros2/`)**: ROS2 Jazzy (`rclpy`, `ros2_control`, `robot_bringup`, `arm_controller`, `workcell_manager`, `robot_control_interfaces`). 500 Hz RTDE loop with real/fake hardware support, analytical IK solver, and action servers.
- **DataFabric**: Zenoh pub/sub using RESTful scoping: `robot/{id}/command` and `robot/{id}/telemetry`. No direct `rosbridge`.

## Development Methodology

- **Specification Driven Development (SDD)**: Project units roadmap lives in `support_files/specs/units.md`.
- **Contract-First Staged Architecture (Spec & Ticket Generation Protocol)**:
  Every unit or phase specification and ticket breakdown strictly follows a 3-stage lifecycle:
  1. **Stage 0: Domains, Interfaces & Schemas First (`Unit X.0`)**: Single source of truth. Define or update wire schemas in `schemas/` and domain constants. Regenerate cross-language types via `scripts/generate_domain.py` (`src/domain/domain.py`, `src/domain/domain.rs`, `web/domain/contracts.ts`). Lock domain contracts with cross-language serialization unit tests before implementing nodes.
  2. **Stage 1..N: Subsystem Modules in Isolation (`Unit X.1`, `X.2`, `X.3`, ...)**: Develop each module (`EdgeNode`, `Gateway`, `TeleopClient`, asset loaders/simulators) in total isolation against mocked port seams and generated domain types. Zero inter-process coupling during development. Verify each module hermetically via unit/component test suites (`pytest`, `cargo nextest`, `vitest`).
  3. **Stage Final: Connect Everything Together (`Unit X.N`)**: Multi-service automated integration suite (Playwright / Cucumber E2E) orchestrating real processes. Validates full end-to-end wire integration, real-time timing, and latency budgets (<50ms).
- **Test-Driven Development (TDD)**: Every task begins with a failing test (red → green → refactor).
  - Rust: `cargo check --workspace --all-targets`, `cargo clippy --workspace --all-targets`, & `cargo test` / `cargo nextest run --workspace`
  - Python: `pytest`
  - Web: `npm --prefix web run test`, `npm --prefix web run lint`, & `npm --prefix web run typecheck`

## Domain Invariants

- **Robot Model**: UR5e 6-DoF manipulator for Phase 1.
- **Coordinate Conventions**: REP-103 (+X forward, +Y left, +Z up) ↔ WebGL (+X right, +Y up, +Z back). Never manually swizzle quaternion components.
- **Message Contracts**: Explicit domain schemas for `RobotCommand` and `RobotTelemetryEvent`. Never send raw ROS2 DDS structs over external networks.
- **Error Semantics**: Schema validation errors return structured `ERROR` frames over WebSocket without terminating connection.

## Code Organization & Directory Invariants

- **Tests**: Keep all test files strictly in dedicated `tests/` directories (never colocated with source implementation files). Web tests live in `web/tests/` (`web/tests/unit/` and `web/tests/e2e/`).
- **Utilities**: Keep shared helpers and utilities in `utils/` directories (e.g. `web/src/utils/`).
- **Components**: Keep all UI views/components in `components/` directories (e.g. `web/src/components/`).

## Agent Skills & Tracking

- **Issue Tracker**: Tracked locally via `beans` in `.beans/`. See `docs/agents/issue-tracker.md`.
- **Triage Labels**: 5 canonical tags (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
- **Domain Docs**: Single-context domain model in `CONTEXT.md`. Architecture decisions in `docs/adr/`.

