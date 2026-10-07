#!/usr/bin/env bash
# Lane teleop-client: the TeleopClient alone (oxfmt, oxlint, typecheck, vitest); the Gateway is mocked.
# Cucumber E2E (also against the mock gateway) is not part of the lane.
source "$(dirname "$0")/_lib.sh"
checks() {
  step "oxfmt" npm --prefix web run -s format:check
  step "oxlint" npm --prefix web run -s lint
  step "typecheck" npm --prefix web run -s typecheck
  step "vitest" npm --prefix web run -s test -- --minWorkers=1 --maxWorkers="$JOBS"
}
lane_main teleop-client checks
