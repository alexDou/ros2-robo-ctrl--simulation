#!/usr/bin/env bash
# Enforces the AGENTS.md end-of-task gate.
#   verify-gate.sh start  (UserPromptSubmit) record the working-tree fingerprint at turn start
#   verify-gate.sh stop   (Stop) block once if Claude changed files this turn and a lane the change
#                         touches has no green run on the current files (scripts/verify/status.sh)
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
input="$(cat)"
sid="$(jq -r '.session_id // "default"' <<<"$input")"
state="$root/.verify/turn-start-$sid"
mkdir -p "$root/.verify"
fp="$("$root/scripts/verify/status.sh" --fingerprint)"

if [[ "${1:-}" == "start" ]]; then
  echo "$fp" >"$state"
  exit 0
fi

# Already blocked once this turn: let Claude stop (it must report the RED result honestly).
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0
[[ "$fp" == "$(cat "$state" 2>/dev/null)" ]] && exit 0            # nothing changed this turn
pending="$("$root/scripts/verify/status.sh" --pending)"
[[ -z "$pending" ]] && exit 0                                    # every touched lane is green

jq -n --arg lanes "$pending" '{decision: "block",
  reason: ("Files changed this turn and these verify lanes have no green run on the current files: " + $lanes
    + ". Run each one on its own, one at a time (scripts/verify/<lane>.sh, contracts first), fix failures until it prints GREEN, or report the remaining failures by name (say which are pre-existing).")}'
