# HandSim Project Instructions

## System Architecture

Decoupled three-tier distributed architecture following Clean Architecture & Ousterhout Deep Modules:

- **Web Visualizer (`web/`)**: Preact + Vite + Three.js (`urdf-loader`) + Vitest. Linted via OXC (`oxlint`), formatted via Prettier.
- **Gateway (`src/gateway/`)**: Actix-Web WebSocket service. Encapsulates Zenoh session behind deep port facade. Enforces single active session per robot (`409 Conflict` on duplicate). Translates WebSocket frames ↔ Zenoh expressions.
- **EdgeNode (`src/edge_node/`)**: Python (uv) + ROS2 Jazzy (`rclpy`) + `eclipse-zenoh`. Ingests ROS2 topics/actions, validates state machine, emits typed telemetry.
- **DataFabric**: Zenoh pub/sub using RESTful scoping: `robot/{id}/command` and `robot/{id}/telemetry`. No direct `rosbridge`.

## Development Methodology

- **Specification Driven Development (SDD)**: Phase 1 roadmap lives in `support_files/specs/phase1/units.md`.
- **Test-Driven Development (TDD)**: Every task begins with a failing test (red → green → refactor).
  - Rust: `cargo nextest run --workspace` & `cargo clippy --workspace --all-targets`
  - Python: `pytest`
  - Web: `npm --prefix web run test` & `npm --prefix web run lint`

## Domain Invariants

- **Robot Model**: UR5e 6-DoF manipulator for Phase 1.
- **Coordinate Conventions**: REP-103 (+X forward, +Y left, +Z up) ↔ WebGL (+X right, +Y up, +Z back). Never manually swizzle quaternion components.
- **Message Contracts**: Explicit domain schemas for `RobotCommand` and `RobotTelemetryEvent`. Never send raw ROS2 DDS structs over external networks.
- **Error Semantics**: Schema validation errors return structured `ERROR` frames over WebSocket without terminating connection.

## Agent Skills & Tracking

- **Issue Tracker**: Tracked locally via `beans` in `.beans/`. See `docs/agents/issue-tracker.md`.
- **Triage Labels**: 5 canonical tags (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
- **Domain Docs**: Single-context domain model in `CONTEXT.md`. Architecture decisions in `docs/adr/`.

