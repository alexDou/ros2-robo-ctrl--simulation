---
# hand-sim-6n92
title: 'Unit 7.2: Gateway QcClassifier plugin'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:12Z
updated_at: 2026-09-24T16:26:51Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-9kw2
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As a simulation engineer, I want every spawn enriched with a color (WHITE/GREEN/BLUE, equal probability) and a defective flag (roughly 20%) by a one-function plugin seam in the Gateway, so that a real inspection service can later replace the random stub with a one-line wiring change. The click still places an initially grey Gearwheel; classification lands via enrichment before publish. No other Gateway behavior changes.

## Acceptance criteria

- [ ] Spawn path classifies after validation and before publish; pick-and-place path untouched
- [ ] Colors assigned WHITE/GREEN/BLUE with roughly equal probability
- [ ] Roughly 20 defective flags per 100 classifications within tolerance
- [ ] Seeded mock replays a fixed sequence deterministically
- [ ] Swapping stub for another source means implementing the interface + one wiring line
- [ ] Rate limiting, session exclusivity, telemetry handling unchanged

## Blocked by

- hand-sim-9kw2 (Unit 7.0 domain contracts)

## Clarified spawn-classification flow (user, 2026-09-24)

- TeleopClient sends blind SPAWN_OBJECT: x,y,z,object_type only (TS Omit color/intact); never knows color/quality.
- Gateway validates blind payload (client-supplied color/intact rejected), then enriches via QcClassifier stub (uniform WHITE/GREEN/BLUE, ~20pct defective) standing in for future real inspection node.
- Downstream of Gateway enrichment every gear carries mandatory color + intact/defective; GearEntry requires both, no defaults.
- Enriched spawn travels gateway->workcell classified; SpawnObject.srv already accepts color+defective.
- spawn_clear blind-shape assertions cover inbound client->gateway shape only, not enriched gateway->fabric shape.

## Summary of Changes (implementation complete, uncommitted->committing)

Files: src/gateway/src/qc_classifier.rs (NEW: QcClassifier trait, RandomQcClassifier xorshift64*, SeededQcClassifier replay mock, enrich_spawn_payload color+defective), src/gateway/tests/qc_classifier.rs (NEW: 5 tests), src/gateway/src/lib.rs (mod), src/gateway/Cargo.toml (test target), src/gateway/src/ws/mod.rs (spawn-only enrich post-validation pre-publish), src/gateway/tests/ws_gateway/spawn_clear.rs (fabric enriched asserts + blind re-parse), src/ros2/.../edge_bridge/commands.py (pop color/defective pre-validate, forward to SpawnObject.srv).

Tests: qc_classifier 5/5, ws_gateway 8/8, domain_contract 19/19, telemetry_throttler 10/10, cargo check clean, clippy 0 new (11 pre-existing ws_gateway warnings), edge+workcell 41/41, domain py 19/19, web 183/183 + lint/typecheck clean. Full ROS2 suite 81/82 with pre-existing flake test_standby_during_motion_parks_home_once (passes isolated/file-only, fails under parallel load on clean tree too).

Code review (2 axes, read-only): Standards - no hard AGENTS.md breaches; notes: tuple-bool polarity, per-spawn RNG construction, Value-based enrich (judgement calls, kept surgical per spec one-function seam). Spec - no scope creep; order validate->enrich->publish correct, pick-and-place untouched; notes: per-message wall-clock seed untested in prod path (tests cover seeded(42)), edge silent WHITE/intact defaults mask missing enrichment (kept: matches pre-existing getattr defaults + .srv defaults), swap-ability via trait+one wiring line.
