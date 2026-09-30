---
# hand-sim-kok2
title: 'Status row: never blink; always-mounted content with a default message'
status: completed
type: task
priority: normal
created_at: 2026-09-30T13:09:12Z
updated_at: 2026-09-30T13:15:23Z
parent: hand-sim-d04j
---

User added a background to the robot-state message. The message cell is conditionally mounted (message && ...), so the background box appears/disappears between states. Keep the box always in the DOM; change only its text, with a default message (e.g. 'Robot IDLE: ready') when there is nothing to report. Progress cell likewise always mounted, content only.

Message box and progress cell always mounted; default 'Robot IDLE: ready.'; unit + E2E green.
