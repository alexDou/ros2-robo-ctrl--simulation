#!/usr/bin/env bash
# Lane gateway: the Gateway alone (fmt, clippy, nextest); the DataFabric is mocked behind its port facade.
source "$(dirname "$0")/_lib.sh"
export CARGO_BUILD_JOBS="$JOBS"
checks() {
  step "cargo fmt" cargo fmt --all --check
  step "clippy" cargo clippy --workspace --all-targets -q -- -D warnings
  step "nextest" cargo nextest run --workspace --all-targets --no-fail-fast --status-level fail -j "$JOBS"
}
lane_main gateway checks
