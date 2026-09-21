---
# hand-sim-5ije
title: 'Unit 6.6.1: Gateway preserves authoritative state'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:18Z
updated_at: 2026-09-21T11:21:51Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-jqtr
---

## Parent

hand-sim-4814

## What to build

Decimated 30Hz telemetry frames keep EdgeNode EXECUTING plus is_grasped instead of clobbering to Idle/false. Gear no longer flickers out when arm moves.

## Acceptance criteria

- [ ] joint-bytes decimation after state set still emits EXECUTING plus grasped
- [ ] no Idle/false flood interleaved with authoritative EXECUTING frames
- [ ] gateway throttler regression test green

## Blocked by

- hand-sim-jqtr (Unit 6.6.0)

## Summary of Changes

TDD red->green. Added test_telemetry_throttler_joint_bytes_preserve_authoritative_state (set EXECUTING+grasped, push raw joint JSON, assert emitted frame keeps EXECUTING/grasped + joint values). No impl change needed: push_bytes CDR/JSON paths already inject guard.current_robot_state/palm_state (throttler.rs:271-278,340-347). Suite: 8 passed. Clippy: baseline-identical (5 pre-existing too-many-lines warnings, untouched).
