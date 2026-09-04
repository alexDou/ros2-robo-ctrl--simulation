---
description: "Executes targeted cargo check with ROS2 environment sourced"
---
1. Run `source /opt/ros/${ROS_DISTRO:-jazzy}/setup.bash && cargo check --workspace --tests --all-targets`
2. If ROS2 client libraries fail to link, verify ROS setup script was sourced.
3. Report any unused variables or unhandled Result types.
