---
# hand-sim-2lcq
title: 'Unit 3.2: TeleopClient Three.js RobotVisualizer Canvas & 75/25 Layout'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:33Z
updated_at: 2026-09-12T14:40:00Z
parent: hand-sim-liyi
blocked_by:
    - hand-sim-w74s
---

## Parent

hand-sim-liyi

## What to build

Build the high-performance Preact `RobotVisualizer` Three.js component and integrate it into `TeleopClient` with a responsive 75/25 split-pane layout. The left pane (75% desktop width) hosts the WebGL canvas rendering the UR5e manipulator on a calibrated 1m ground grid with 10cm subdivisions. The right pane (25% desktop width) houses the `TelemetryMonitor` sidebar displaying operational state badges, stream rate, latency, and joint cards vertically. On narrow viewports (< 1024px), the layout automatically collapses into a single-column vertical stack. Equip the 3D scene with balanced ambient/directional lighting and OrbitControls centered on the robot shoulder with clamped polar angles (preventing camera traversal below the ground) and min/max zoom distances. Implement robust WebGL lifecycle cleanup disposing geometries, materials, textures, controls, and animation frame loops on component unmount. Provide Vitest tests verifying DOM layout reflow, canvas mounting, and resource disposal.

## Acceptance criteria

- [x] `RobotVisualizer` renders Three.js WebGL canvas displaying the UR5e model loaded via `robotLoader`.
- [x] 3D scene includes calibrated 1m ground grid helper, ambient diffuse lighting, and directional key lighting.
- [x] OrbitControls centered on robot shoulder with zoom clamping and polar limits preventing underground camera traversal.
- [x] `TeleopClient` implements 75/25 split desktop layout with 3D visualizer on left and `TelemetryMonitor` sidebar on right.
- [x] Responsive layout collapses into single-column stack on screens narrower than 1024px.
- [x] Component unmount cleanly disposes WebGL context, buffer geometries, materials, textures, controls, and cancels animation frame requests.
- [x] Vitest component tests assert 75/25 layout styling, canvas mount, and cleanup execution.

## Blocked by

- hand-sim-w74s (Unit 3.0: URDF Model Extraction & Static Mesh Asset Distribution)
