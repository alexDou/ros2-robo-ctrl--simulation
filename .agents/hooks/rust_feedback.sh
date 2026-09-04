#!/usr/bin/env bash
set -eo pipefail

# Find modified Rust files
CHANGED_RS=$(git status --porcelain | awk '{print $2}' | grep -E '\.rs$' || true)

if [ -n "$CHANGED_RS" ]; then
  # Source ROS2 workspace environment if required for rclrs bindings
  if [ -z "$ROS_DISTRO" ]; then
    if [ -f /opt/ros/jazzy/setup.bash ]; then
      source /opt/ros/jazzy/setup.bash
    elif [ -f /opt/ros/humble/setup.bash ]; then
      source /opt/ros/humble/setup.bash
    fi
  fi

  # 1. Format dirty files instantly
  echo "$CHANGED_RS" | xargs rustfmt --edition 2021 2>/dev/null || true

  # 2. Workspace diagnostics using Cargo.toml [workspace.lints]
  # Using short-format output to keep agent context tight
  cargo clippy --workspace --all-targets --message-format=short 2>&1 | head -n 35

  # 3. Incremental unit test pass (only run unit tests, skip heavy integration/sim tests)
  if command -v cargo-nextest >/dev/null 2>&1; then
    cargo nextest run --workspace --lib -q 2>&1 | tail -n 15 || true
  else
    cargo test --lib --workspace -q 2>&1 | tail -n 15 || true
  fi
fi
