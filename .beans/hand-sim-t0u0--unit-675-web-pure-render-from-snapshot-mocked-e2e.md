---
# hand-sim-t0u0
title: 'unit 6.7.5 web: pure render from snapshot + mocked e2e'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:32Z
updated_at: 2026-09-21T23:22:40Z
parent: hand-sim-cf7y
blocked_by:
    - hand-sim-1n85
    - hand-sim-2be6
    - hand-sim-qdnj
    - hand-sim-dqcu
    - hand-sim-3lts
---

useTelemetryStream buffer.workcellState. RobotVisualizer pure render: spawned->table mesh, in_progress->flange ride, processed[]->tower meshes at entry coords verbatim. Delete towerGears/deposit fns/IDLE net/grasp-bit cases/RELEASE_STABLE_FRAMES. useTeleopSession: spawn sends only SPAWN_OBJECT. mock_gateway emits bucket snapshots. Border rule: TeleopClient vs mocked gateway.
