---
# hand-sim-pn7u
title: 'Unit 7.3d: Defect notch + detected_object'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:24Z
updated_at: 2026-09-24T19:37:05Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-6n92
    - hand-sim-7839
    - hand-sim-17xk
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want defective Gearwheels to show a visible crack notch and the classification outcome reported through the existing inference channel, so that I can tell at a glance why a Gearwheel went to scrap.

## Acceptance criteria

- [ ] Defective Gearwheel renders a crack notch; sound Gearwheels show none
- [ ] Notch survives recolor-on-echo, tower/bin routing, and snapshot reconciliation
- [ ] Existing inference detected-object label carries WHITE, GREEN, BLUE, or DEFECTIVE; no new channel

## Blocked by

- hand-sim-6n92 (Unit 7.2 Gateway plugin)
- hand-sim-7839 (Unit 7.3b recolor-on-echo)
- hand-sim-17xk (Unit 7.3c bin fixture)

## Summary of Changes (commit 6c040bb)

Files: edge_bridge/telemetry.py (+active_id-match inference mapper), gear.ts (crack-notch + null-preserving setGearwheelIntact), snapshot.ts (intact reconcile), handle.ts + global.d.ts (getSnapshotGearIntact probe), useTelemetryStream.ts (buffer.inferenceMetrics), TelemetryMonitor (QC detected_object row), mock_gateway.ts (WHITE on spawn, null on deposit/reset). New: test_edge_bridge_inference.py (5), defect.test.tsx (3).
Tests: web typecheck clean, lint 0/0, full web 202/202 (38 files), py 87 passed. Review fixes: active_id-first match, null-intact no-op preserving notch.
