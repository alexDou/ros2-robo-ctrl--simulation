#!/usr/bin/env bash
# Lane semgrep: the trust-boundary rules over the whole tree.
source "$(dirname "$0")/_lib.sh"
checks() {
  step "semgrep" semgrep scan --config .semgrep/robot-security.yml --error --metrics=off -q
}
lane_main semgrep checks
