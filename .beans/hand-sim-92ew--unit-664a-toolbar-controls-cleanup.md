---
# hand-sim-92ew
title: 'Unit 6.6.4a: Toolbar controls cleanup'
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

Toolbar keeps Home pose only (Ready/Inspect gone), palm cluster gone, E-STOP gone. Single Connect/Disconnect toggle lives in toolbar right slot. No bottom buttons.

## Acceptance criteria

- [ ] no E-STOP, no palm buttons, no Ready/Inspect in DOM
- [ ] Home pose button works
- [ ] Connect/Disconnect toggle in toolbar right slot; bottom toggle removed

## Blocked by

- hand-sim-jqtr (Unit 6.6.0)
