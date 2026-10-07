---
# hand-sim-m0gn
title: 'Unit 9.29: EmergencyStop button always visible while connected'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-07T15:44:37Z
updated_at: 2026-10-07T16:11:29Z
parent: hand-sim-rqpy
---

D36. TeleopClient toolbar EMERGENCY STOP button, enabled whenever connected (FAULT/RESETTING included), calls useTeleopSession.emergencyStop(). Update toolbar unit tests (currently assert absence) and E2E to click the button.

Done: OperatorToolbar EMERGENCY STOP button (rendered while CONNECTED, never gated), wired to useTeleopSession.emergencyStop(). Unit tests + both E-stop E2E scenarios click it.
