#!/usr/bin/env bash
# End-of-task quality gate: codegen drift -> {rust, python, web} lanes in parallel -> semgrep.
#
#   scripts/verify.sh                 run the full gate (logs in .verify/)
#   scripts/verify.sh --fingerprint   print the working-tree fingerprint (used by the Claude Stop hook)
#
# On success, writes the fingerprint to .verify/stamp so the Stop hook knows the current tree is green.
set -uo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
OUT="$ROOT/.verify"

# Tree hash of the working tree incl. untracked (non-ignored) files, without touching the real index.
fingerprint() {
  local idx
  idx="$(mktemp)"
  cp "$(git rev-parse --git-path index)" "$idx" 2>/dev/null || true
  GIT_INDEX_FILE="$idx" git add -A . >/dev/null 2>&1
  GIT_INDEX_FILE="$idx" git write-tree
  rm -f "$idx"
}

if [[ "${1:-}" == "--fingerprint" ]]; then
  fingerprint
  exit 0
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.log "$OUT/stamp"
FP_START="$(fingerprint)"

# step <label> <cmd...>: run one check, keep going on failure so a single run surfaces everything.
step() {
  local label="$1"; shift
  echo "▶ $label"
  if "$@"; then return 0; fi
  echo "✖ $label FAILED"
  FAILS+=("$label")
  return 1
}

lane_codegen() {
  python3 scripts/generate_domain.py --check
}

lane_rust() {
  FAILS=()
  step "cargo fmt" cargo fmt --all --check
  step "clippy" cargo clippy --workspace --all-targets -q -- -D warnings
  step "nextest" cargo nextest run --workspace --all-targets --no-fail-fast --status-level fail
  [[ ${#FAILS[@]} -eq 0 ]] || { echo "rust failed: ${FAILS[*]}"; return 1; }
}

lane_python() {
  FAILS=()
  step "ruff format" ruff format --check .
  step "ruff check" ruff check .
  set +u
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
  if step "colcon build" colcon build --symlink-install --event-handlers console_direct-; then
    # shellcheck disable=SC1091
    source install/setup.bash
    # Root tests/ symlinks the ROS package tests; run those in-package so their conftest applies.
    step "pytest tests/" python3 -m pytest -q -p no:cacheprovider $(find tests -maxdepth 1 -type f -name 'test_*.py')
    step "pytest ros2 pkgs" python3 -m pytest -q -p no:cacheprovider src/ros2/workcell_manager/test/ src/ros2/arm_controller/test/ src/ros2/cell_devices/test/ src/ros2/robot_bringup/test/test_virtual_plc_launch.py
  fi
  set -u
  [[ ${#FAILS[@]} -eq 0 ]] || { echo "python failed: ${FAILS[*]}"; return 1; }
}

lane_web() {
  FAILS=()
  step "oxfmt" npm --prefix web run -s format:check
  step "oxlint" npm --prefix web run -s lint
  step "typecheck" npm --prefix web run -s typecheck
  step "vitest" npm --prefix web run -s test
  [[ ${#FAILS[@]} -eq 0 ]] || { echo "web failed: ${FAILS[*]}"; return 1; }
}

lane_semgrep() {
  semgrep scan --config .semgrep/robot-security.yml --error --metrics=off -q
}

run() { # run <lane> -> logs to .verify/<lane>.log, returns lane status
  local name="$1"
  ("lane_$name") >"$OUT/$name.log" 2>&1
}

declare -A STATUS
report() {
  local failed=0
  echo "── verify summary ──"
  for name in codegen rust python web semgrep; do
    [[ -z "${STATUS[$name]:-}" ]] && continue
    if [[ "${STATUS[$name]}" == 0 ]]; then
      echo "  PASS  $name"
    else
      failed=1
      echo "  FAIL  $name   (full log: .verify/$name.log)"
      grep -E "^(✖|[a-z]+ failed:)" "$OUT/$name.log" | sed "s/^/        /"; tail -n 20 "$OUT/$name.log" | sed 's/^/        /'
    fi
  done
  return "$failed"
}

run codegen
STATUS[codegen]=$?
if [[ "${STATUS[codegen]}" != 0 ]]; then
  report
  echo "Codegen drift: edit schemas/ and run 'python3 scripts/generate_domain.py', never the generated files."
  exit 1
fi

declare -A PIDS
for name in rust python web; do
  run "$name" &
  PIDS[$name]=$!
done
for name in rust python web; do
  wait "${PIDS[$name]}"
  STATUS[$name]=$?
done

run semgrep
STATUS[semgrep]=$?

if report; then
  if [[ "$(fingerprint)" == "$FP_START" ]]; then
    echo "$FP_START" >"$OUT/stamp"
    echo "verify: GREEN"
  else
    echo "verify: GREEN, but files changed while it ran (formatter/codegen?); re-run to stamp."
  fi
  exit 0
fi
echo "verify: RED"
exit 1
