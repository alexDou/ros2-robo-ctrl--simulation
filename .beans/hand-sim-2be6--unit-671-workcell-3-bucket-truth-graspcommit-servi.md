---
# hand-sim-2be6
title: 'unit 6.7.1 workcell: 3-bucket truth + grasp/commit services'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:32Z
updated_at: 2026-09-21T20:39:40Z
parent: hand-sim-cf7y
blocked_by:
    - hand-sim-1n85
---

Replace _active_workpiece/_inventory-counter with _spawned/_in_progress dicts + _processed list. handle_spawn_object (uuid4, reject if busy), handle_mark_grasped (spawned->in_progress, origin kept), handle_commit_drop (in_progress->processed with drop xyz, origin preserved), get_drop_slot pure reservation, clear wipes all. Publish workcell/state JSON on mutation + 1Hz heartbeat. pytest bucket tests.
