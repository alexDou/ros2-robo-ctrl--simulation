---
# hand-sim-cf7y
title: unit 6.7 state controll
status: todo
type: feature
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:02Z
updated_at: 2026-09-21T18:09:42Z
parent: hand-sim-d20p
---

Workcell-authority 3-bucket gear state. Workcell owns gear truth (spawned/in_progress/processed, each a list of coordinate objects {id,x,y,z,+origin}). Snapshot embedded in RobotTelemetryEvent (option A), ROS2->edge->gateway->UI at 5Hz. UI renders verbatim, zero gear authority. Arm id-free. No timeout drives transitions. Click=placement AND dispatch. Plan: workcell-authority-plan.md in conversation brain dir.

Plan: /home/ros2/.gemini/antigravity-cli/brain/20d9cb7d-695e-48f4-9538-d21e99770253/workcell-authority-plan.md (option A embed, auto-dispatch, backend uuids, no counters, no timeouts). Children: 6.7.0 domain -> 6.7.1/6.7.2/6.7.3/6.7.4 parallel -> 6.7.5 web last.
