#!/usr/bin/env bash
set -eo pipefail
# Rebuild ROS2 + Gateway. Bespoke wrapper, violates AGENTS.md tooling discipline by explicit user request.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ "${1:-}" == "--clean" ]]; then
  echo "[rebuild] removing build/ install/ log/"
  rm -rf "$PROJECT_ROOT/build" "$PROJECT_ROOT/install" "$PROJECT_ROOT/log"
  shift
fi
source /opt/ros/jazzy/setup.bash
echo "[rebuild] regenerating domain types..."
python3 "$PROJECT_ROOT/scripts/generate_domain.py"
echo "[rebuild] building ROS2 packages..."
cd "$PROJECT_ROOT"
colcon build --symlink-install "$@"
echo "[rebuild] building Gateway..."
cargo build --workspace
echo "[rebuild] done. Run: source $PROJECT_ROOT/install/setup.bash"
