---
# hand-sim-dnv4
title: 'Unit 6.6.4b: Ping health probe'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:28Z
updated_at: 2026-09-21T10:47:17Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-jqtr
---

## Parent

hand-sim-4814

## What to build

Verify Connection works when connected-but-not-streaming (gateway health probe plus EventLog), visible pre-stream, removed from DOM during 30Hz streaming.

## Acceptance criteria

- [ ] Ping button present plus functional pre-stream (logs event)
- [ ] Ping removed from DOM during streaming
- [ ] disconnected Ping does not no-op silently

## Blocked by

- hand-sim-jqtr (Unit 6.6.0)
