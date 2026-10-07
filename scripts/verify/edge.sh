#!/usr/bin/env bash
# Lane edge: the EdgeNode side (ROS2 packages) alone: ruff, colcon build and the package tests with the
# DataFabric and field I/O mocked. ROS_DOMAIN_ID defaults to 77, so a running
# SIM cannot cross-talk with the test nodes.
source "$(dirname "$0")/_lib.sh"
export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-77}"
checks() {
  step "ruff format" ruff format --check .
  step "ruff check" ruff check .
  set +u
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
  if step "colcon build" colcon build --symlink-install --parallel-workers "$JOBS" --event-handlers console_direct-; then
    # shellcheck disable=SC1091
    source install/setup.bash
    # Root tests/ symlinks the ROS package tests; run those in-package so their conftest applies.
    # shellcheck disable=SC2046
    step "pytest tests/" python3 -m pytest -q -p no:cacheprovider $(find tests -maxdepth 1 -type f -name 'test_*.py')
    step "pytest ros2 pkgs" python3 -m pytest -q -p no:cacheprovider src/ros2/workcell_manager/test/ src/ros2/arm_controller/test/ src/ros2/cell_devices/test/ src/ros2/cell_orchestrator/test/ src/ros2/robot_bringup/test/test_virtual_plc_launch.py
  fi
  set -u
}
lane_main edge checks
