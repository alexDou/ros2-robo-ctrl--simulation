---
description: "Builds ROS2 packages and checks TypeScript web bindings"
---
1. Run `colcon build --symlink-install`
2. Run `npm --prefix web run typecheck`
3. If errors occur, diagnose without altering coordinate bridge signatures.
