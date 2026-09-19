---
# hand-sim-dynp
title: 'Refactor-B.7: TeleopClient Connect-Gated WebSocket With ROS2 Handshake Trigger'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-19T20:46:24Z
updated_at: 2026-09-19T21:23:36Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-1j8b
---

## Parent

hand-sim-wt44

## What to build

TeleopClient stays offline on page load: no WebSocket opens and ROS2 layer stays parked in STANDBY until the operator presses Connect. Pressing Connect opens the WS channel (zero protocol commands from the UI), which triggers the Gateway ENGAGE handshake and hence ROS2 activation; Disconnect closes the channel and triggers STANDBY re-park.

Gateway keeps no state machine: it forwards telemetry opaque and keeps single-session 409 Conflict plus the 20Hz command rate limit.

TeleopClient surfaces the new lifecycle honestly: no auto-connect, stream init/reset to STANDBY, never mask STANDBY as IDLE, BOOTING spinner window during activation (switch + sub + home takes seconds), ConnectionBadge STANDBY-parked and BOOTING-activating visuals, OperatorToolbar disabled until IDLE with a reason. Define a BOOTING timeout with STANDBY fallback.

## Acceptance criteria

- [ ] Page load opens zero WebSocket connections; TeleopClient shows DISCONNECTED with an enabled Connect button
- [ ] Pressing Connect opens exactly one WS session, Gateway publishes ENGAGE, bridge activates controllers and streams telemetry
- [ ] Connect transitions through BOOTING to IDLE; BOOTING timeout falls back to STANDBY
- [ ] Telemetry stream inits/resets to STANDBY; STANDBY is never displayed as IDLE
- [ ] ConnectionBadge shows STANDBY-parked and BOOTING-activating states; OperatorToolbar stays disabled until IDLE with a reason
- [ ] Pressing Disconnect (or connection drop) closes WS, Gateway publishes STANDBY exactly once, bridge re-parks with zero joint traffic
- [ ] Existing session semantics unchanged: single-session 409 Conflict, 20Hz rate limit, auto-Reconnect offer only after a prior Connect
- [ ] Standalone ROS2 launch stays silent (parked, no joint traffic) until Connect

## Blocked by

- hand-sim-1j8b (Refactor-B.5)

## Merged from

- hand-sim-2zz1 (TeleopClient Connect + Gateway handshake UX placeholder, merged 2026-09-19; UX scope folded in, epic deleted)

## Summary of Changes (2026-09-19)

Connect-gated WS implemented, all web unit tests pass (174/174), lint + typecheck clean.
- useTeleopSession: initial DISCONNECTED, no auto-connect, added disconnect(), hasEverConnected; STANDBY fallbacks replace IDLE masking.
- useTelemetryStream: init/reset to STANDBY parked state.
- TeleopClient: Connect (first run) / Disconnect (online) / Reconnect (after prior connect) buttons; BOOTING window with 10s timeout fallback to STANDBY; toolbar connection-gated with reason line for non-IDLE states.
- ConnectionBadge: CONNECTED / STANDBY (parked) and / BOOTING (activating) suffixes, always suffixed when CONNECTED.
- OperatorToolbar: new disabledReason prop + reason line.
- E2E: TeleopPage connect/disconnect locators; teleop steps click Connect after goto (open visualizer, active-connect, second session).
- Gateway/ROS2 untouched: ENGAGE-on-connect, STANDBY-exactly-once-on-disconnect, 409 + 20Hz unchanged (proven B.1-B.5).
