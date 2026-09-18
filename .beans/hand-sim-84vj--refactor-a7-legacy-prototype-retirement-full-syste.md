---
# hand-sim-84vj
title: 'Refactor-A.7: Legacy Prototype Retirement & Full System Verification'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T22:29:02Z
updated_at: 2026-09-18T13:46:00Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-nxx6
---

## Parent

hand-sim-wt44

## What to build

Permanently retire and delete legacy prototype files in src/edge_node/ (main.py, node.py, mock_publisher.py, mock_motion_publisher.py, workcell.py, mapper.py) and obsolete prototype tests (tests/test_edge_node.py, tests/test_mock_motion_publisher.py). Adjust non-RT execution tolerance in tests/test_robot_nodes_launch.py for CPU/CI virtualization. Clean up pyproject.toml, package configurations, and documentation references. Run and harmonize full multi-tier test suite (Cargo, Colcon, Pytest, Web).

## Acceptance criteria

- [x] Deprecated directory src/edge_node/ and files completely removed
- [x] Obsolete tests tests/test_edge_node.py and tests/test_mock_motion_publisher.py removed cleanly
- [x] pyproject.toml and workspace configs updated with zero stale prototype references
- [x] Non-realtime tolerance adjusted in test_robot_nodes_launch.py to pass reliably under simulated load
- [x] Full project test suite passes 100% green:
  - cargo test --workspace
  - colcon test (robot_bringup, arm_controller, workcell_manager, robot_control_interfaces)
  - pytest tests/
  - npm --prefix web run test && npm --prefix web run test:e2e

## Blocked by

- hand-sim-nxx6 (Refactor-A.6)
