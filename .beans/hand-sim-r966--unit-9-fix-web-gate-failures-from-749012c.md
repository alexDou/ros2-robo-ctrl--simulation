---
# hand-sim-r966
title: 'Unit 9.01: fix web gate failures from 749012c'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
---

## What to build

The end-of-task gate is RED on feat/conveyor-devices because of commit 749012c (op status bar visibility): ActionProgressBar is not oxfmt-formatted and two TeleopClient action-feedback tests fail (progress bar renders/updates on ACTION_FEEDBACK; progress bar clears on inbound ERROR). Every Unit 9 ticket needs a green gate.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] oxfmt check clean
- [ ] Both progress-bar feedback tests pass without weakening their assertions (fix the component or confirm with the user that the intended behaviour changed)
- [ ] verify: GREEN

## Blocked by

None (can start immediately)
