#!/usr/bin/env bash
# Enforces the AGENTS.md end-of-task gate.
#   verify-gate.sh start  (UserPromptSubmit) record the working-tree fingerprint at turn start
#   verify-gate.sh stop   (Stop) block once if Claude changed files this turn and the tree is not
#                         the last green `scripts/verify.sh` run
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
input="$(cat)"
sid="$(jq -r '.session_id // "default"' <<<"$input")"
state="$root/.verify/turn-start-$sid"
mkdir -p "$root/.verify"
fp="$("$root/scripts/verify.sh" --fingerprint)"

if [[ "${1:-}" == "start" ]]; then
  echo "$fp" >"$state"
  exit 0
fi

# Already blocked once this turn: let Claude stop (it must report the RED result honestly).
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0
[[ "$fp" == "$(cat "$state" 2>/dev/null)" ]] && exit 0            # nothing changed this turn
[[ "$fp" == "$(cat "$root/.verify/stamp" 2>/dev/null)" ]] && exit 0 # current tree verified green

jq -n '{decision: "block",
  reason: "Files changed this turn and the tree has not passed the end-of-task gate. Run /verify (scripts/verify.sh), fix failures until `verify: GREEN`, or report the remaining failures by name (say which are pre-existing)."}'
