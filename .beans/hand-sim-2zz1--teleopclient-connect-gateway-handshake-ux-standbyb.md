---
# hand-sim-2zz1
title: TeleopClient Connect + Gateway handshake UX (STANDBY/BOOTING/IDLE)
status: todo
type: epic
tags:
    - needs-triage
created_at: 2026-09-19T15:09:20Z
updated_at: 2026-09-19T15:09:20Z
---

Placeholder for post-wt44 work. EdgeNode parks STANDBY until Gateway auto-ENGAGE on WS open; UI must surface new states/timing.

Gateway (delta over hand-sim-8ux1 retry): no state machine; forward telemetry opaque; keep 409 + 20Hz limit.
TeleopClient: manual Connect button (= WS open, zero protocol cmds), parsers createEngage/createStandby (debug only), useTeleopSession no auto-connect + BOOTING spinner window + stop masking STANDBY as IDLE, useTelemetryStream init/reset STANDBY, ConnectionBadge STANDBY-parked + BOOTING-activating visuals, OperatorToolbar disabled until IDLE with reason.
Timing: activation = seconds (switch+sub+home); define BOOTING timeout + STANDBY fallback.
Accept: standalone launch silent; Connect -> BOOTING -> IDLE; disconnect -> STANDBY park; toolbar gated with explanation.
