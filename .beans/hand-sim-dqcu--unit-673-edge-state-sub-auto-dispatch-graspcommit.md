---
# hand-sim-dqcu
title: 'unit 6.7.3 edge: state sub + auto-dispatch + grasp/commit calls'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:32Z
updated_at: 2026-09-21T21:54:11Z
parent: hand-sim-cf7y
blocked_by:
    - hand-sim-1n85
---

Subscribe workcell/state, cache snapshot, embed in publish_telemetry. SPAWN_OBJECT async, auto-dispatch PnP on spawn-ack (UI sends one command). on_feedback: first GRASPING -> MarkGrasped, RELEASING -> CommitDrop (async). Failures -> ErrorFrame + cancel, never retry-by-timer. Delete spin loops.
