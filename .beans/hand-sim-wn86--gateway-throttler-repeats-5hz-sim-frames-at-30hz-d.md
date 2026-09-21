---
# hand-sim-wn86
title: Gateway throttler repeats 5Hz sim frames at 30Hz downstream
status: completed
type: bug
priority: normal
created_at: 2026-09-19T19:43:48Z
updated_at: 2026-09-21T10:05:20Z
---

## Context
Sim loop cut 30Hz->5Hz (hand-sim-h7tu, wt44 closed b7dac38). Gateway TelemetryThrottler still ticks fixed 30Hz (DEFAULT_THROTTLE_INTERVAL 33_333_333ns, MissedTickBehavior::Skip, src/gateway/src/throttler.rs:13,122-147). Upstream now 5Hz < downstream 30Hz, so worker forwards latest pending at each 33ms tick -> ~6x duplicate WS frames to TeleopClient.

## What to build
Make gateway downstream rate match (or adapt to) actual upstream sim rate instead of blind 30Hz repeat. Suggested seams: configurable throttle interval / adaptive pass-through when upstream < downstream / dedupe identical stamp frames. Keep 500Hz real-hardware path decimating to 30Hz intact.

## Acceptance criteria
- [x] 5Hz sim upstream produces ~5Hz WS downstream (no 6x repeats) with evidence (ingested vs emitted counts / ws trace)
- [x] 500Hz real upstream still decimates to ~30Hz (existing throttler tests green)
- [x] cargo test + web suite green, no contract drift (generate_domain --check clean)

## Evidence / refs
- src/gateway/src/throttler.rs:13,108-174
- src/ros2/robot_bringup/config/ur_controllers.yaml (5Hz) vs ur_controllers_real.yaml (500Hz)
- wt44 closure b7dac38, launch log /tmp/launch_test_5hz.log stamp 5.00Hz

## Finding 2026-09-19: NO BUG. Worker does pending.take() per 33ms tick (throttler.rs:152-155) -> empty ticks emit nothing. Red test test_telemetry_throttler_5hz_slow_upstream_no_repeat GREEN first run: ingested=10 emitted=10, zero dupes, ~5Hz passthrough. 500Hz tests still green (7+8). Throttler already correct for slow upstream; no source change needed. Closing as wontfix-equivalent with proof.

## Summary of Changes: no src change (throttler already takes pending per tick, empty ticks emit nothing). Added regression test test_telemetry_throttler_5hz_slow_upstream_no_repeat (10 in / 10 out, zero dupes, ~5Hz). Evidence: cargo workspace 15+7+8 ok, web 170 ok, domain check clean, clippy 1 pre-existing warn.
