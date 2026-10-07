#!/usr/bin/env bash
# Lane launch: the whole SIM system at once (SystemLauncher graph + virtual_plc), one full cell flow,
# about 8 min. Not isolated, so it is never required by the Stop hook: run it only when asked, alone,
# with no SIM running.
source "$(dirname "$0")/_lib.sh"
export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-77}"
checks() {
  set +u
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
  if step "colcon build" colcon build --symlink-install --parallel-workers "$JOBS" --event-handlers console_direct-; then
    # shellcheck disable=SC1091
    source install/setup.bash
    step "cell flow" python3 -m pytest -q -p no:cacheprovider src/ros2/robot_bringup/test/test_cell_flow_launch.py
  fi
  set -u
}
lane_main launch checks
