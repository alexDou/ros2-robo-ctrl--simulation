#!/usr/bin/env bash
# Shared by the verify lanes. Each lane tests one part of the system in isolation, with mocks at its
# contract borders. Each lane script is standalone and runs alone, never beside another lane. CI runs the lanes as separate jobs; parallelism belongs in the CI config.
#
# A green lane run writes .verify/<lane>.stamp = that lane's fingerprint, so the Claude Stop hook
# (scripts/verify/status.sh) knows which lanes the current tree has passed.
set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT"
OUT="$ROOT/.verify"
mkdir -p "$OUT"
# Gated lanes (the Stop hook requires the touched ones). launch runs the whole SIM graph: on demand only.
LANES=(contracts gateway edge teleop-client semgrep)
ON_DEMAND=(launch)

# Files each lane checks, as an extended regex on the repo-relative path (semgrep: its rules plus code and config).
lane_files() {
  case "$1" in
    contracts) echo '^(schemas/|scripts/generate_domain\.py$|src/domain/|web/domain/)' ;;
    gateway) echo '^(Cargo\.(toml|lock)$|src/gateway/)|\.rs$' ;;
    edge) echo '^(pyproject\.toml$|src/ros2/|tests/)|\.py$' ;;
    teleop-client) echo '^web/' ;;
    semgrep) echo '^\.semgrep/|\.(rs|py|ts|tsx|js|yml|yaml)$' ;;
    launch) echo '^(src/ros2/|src/domain/|schemas/)' ;;
  esac
}

# Writes the working tree incl. untracked (non-ignored) files into a throwaway index; prints its path.
_tree_index() {
  local idx
  idx="$(mktemp)"
  cp "$(git rev-parse --git-path index)" "$idx" 2>/dev/null || true
  GIT_INDEX_FILE="$idx" git add -A . >/dev/null 2>&1
  echo "$idx"
}

# Fingerprint of the whole working tree (the Stop hook's "did anything change this turn").
tree_fingerprint() {
  local idx
  idx="$(_tree_index)"
  GIT_INDEX_FILE="$idx" git write-tree
  rm -f "$idx"
}

# lane_fingerprint <lane> [HEAD]: hash of "<blob> <path>" for the lane's files, in the working tree or HEAD.
lane_fingerprint() {
  local lane="$1" rev="${2:-}" idx
  if [[ -n "$rev" ]]; then
    git ls-tree -r "$rev" | awk -F'\t' '{split($1, m, " "); print m[3], $2}'
  else
    idx="$(_tree_index)"
    GIT_INDEX_FILE="$idx" git ls-files -s | awk -F'\t' '{split($1, m, " "); print m[2], $2}'
    rm -f "$idx"
  fi | awk -v re="$(lane_files "$lane")" '$2 ~ re' | git hash-object --stdin
}

JOBS="${VERIFY_JOBS:-$(( $(nproc) / 2 ))}"
(( JOBS >= 1 )) || JOBS=1

# step <label> <cmd...>: run one check, keep going on failure so a single run surfaces everything.
FAILS=()
step() {
  local label="$1"; shift
  echo "▶ $label"
  if "$@"; then return 0; fi
  echo "✖ $label FAILED"
  FAILS+=("$label")
  return 1
}

# lane_main <lane> <function>: run the lane's checks at low priority with output in .verify/<lane>.log,
# then stamp it if green and its files did not change meanwhile (a formatter would change them).
lane_main() {
  local lane="$1" fn="$2" fp_start
  renice -n 10 $$ >/dev/null 2>&1 || true
  rm -f "$OUT/$lane.stamp"
  fp_start="$(lane_fingerprint "$lane")"
  echo "verify $lane: $JOBS jobs (VERIFY_JOBS), full log .verify/$lane.log"
  "$fn" > >(tee "$OUT/$lane.log") 2>&1
  if [[ ${#FAILS[@]} -ne 0 ]]; then
    echo "verify $lane: RED (${FAILS[*]})"
    exit 1
  fi
  if [[ "$(lane_fingerprint "$lane")" != "$fp_start" ]]; then
    echo "verify $lane: GREEN, but its files changed while it ran (formatter/codegen?); re-run to stamp."
    exit 0
  fi
  echo "$fp_start" >"$OUT/$lane.stamp"
  echo "verify $lane: GREEN"
}
