#!/usr/bin/env bash
set -eo pipefail

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="$PROJECT_ROOT/install"
ROS_DIR="$PROJECT_ROOT/src/ros2"

source /opt/ros/jazzy/setup.bash && source "$INSTALL_DIR/setup.bash"
python3 -m pytest "$ROS_DIR/workcell_manager/test/" "$ROS_DIR/arm_controller/test/" -q

