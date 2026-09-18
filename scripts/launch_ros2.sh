#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source ROS2 Jazzy and local workspace overlay
source /opt/ros/jazzy/setup.bash
source "$PROJECT_ROOT/install/setup.bash"

echo "[launch_ros2.sh] Launching UR5e bringup and workcell nodes..."
exec ros2 launch robot_bringup robot_nodes.launch.py use_fake_hardware:=true "$@"
