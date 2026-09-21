# Pipeline Rates & Browser Optimisation (locked 2026-09-21)

Single source of truth. Read before any rate/frequency claim. Do NOT re-ask user.

## SIM vs LIVE (both kept, deliberately)

- SIM = 5 Hz update_rate + 5 Hz state_publish_rate
  (`src/ros2/robot_bringup/config/ur_controllers.yaml`, fake hardware). Runs now.
- LIVE = 500 Hz RTDE (`src/ros2/robot_bringup/config/ur_controllers_real.yaml`,
  physical UR5e). Real-world target, deliberately kept, absolutely OK.
- Gateway TelemetryThrottler 30 Hz nominal (`src/gateway/src/throttler.rs`):
  5 Hz sim feed = passthrough/sample-hold; 500 Hz live feed = decimate 500->30.
- Direction: lower freqs where possible, stay real-ready.

## Browser optimisation (current workflow)

- Connect-gated WS, manual Connect, no auto-connect (b81e928).
  BOOTING 10s window, Ping gated until CONNECTED.
- Lazy joint sub while parked idle (356f2e8).
- 5 Hz sim kills CM overruns (ed1a68e).
- Visualizer rAF render from latest sample. No 60FPS interp of 500Hz in sim.

## Bean hierarchy (Unit 6.6)

- d20p (epic,T) -> 4814 (feature,T) -> 8 tasks:
  jqtr C 6.6.0, 5ije T, 3q1f T, he7j T, 92ew T, dnv4 T, rr7s T, cuqv T docs.
- 4814 promoted task->feature to allow parenting.
- s0tn (epic,T): w3t4 T + 5 completed siblings.
- h7tu/wn86: B = type=bug, both completed = correct.

## Strict rules

- Bean status always matches dev state.
- Rate/workflow change touches CONTEXT.md + AGENTS.md + bean bodies same commit.
- Pre-answer: beans list + git status --short before rate claims.
