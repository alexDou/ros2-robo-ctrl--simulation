---
# hand-sim-w4oa
title: PickAndPlace ACTION_FAILED error frame hides the failure reason
status: completed
type: bug
priority: low
created_at: 2026-09-30T13:37:28Z
updated_at: 2026-10-06T09:27:08Z
parent: hand-sim-d04j
---

edge_bridge actions.py publishes ErrorFrame ACTION_FAILED with the fixed text 'PickAndPlace failed', dropping PickAndPlace.Result.message (e.g. 'Controller error: Aborted due to path tolerance violation', 'Target coordinate out of reach'). The UI can only show the generic text. Found while diagnosing hand-sim-pabi. Consider forwarding a sanitised reason in the ErrorFrame message.

Fixed: ErrorFrame message now 'PickAndPlace failed: <reason>' (printable chars only, capped at 200).
