#!/usr/bin/env bash
# Which lanes the working tree still owes a green run.
#
#   scripts/verify/status.sh                 list each lane: clean (same as HEAD), green (stamped) or PENDING;
#                                            exit 1 if any lane is PENDING. launch is never PENDING, only
#                                            "on demand" (it runs the whole SIM graph; only when asked)
#   scripts/verify/status.sh --pending       print only the PENDING lane names (used by the Claude Stop hook)
#   scripts/verify/status.sh --fingerprint   print the whole-tree fingerprint (used by the Claude Stop hook)
#
# A lane is PENDING when the change touches its files (they differ from HEAD) and its last green run was
# not on these exact files. Committed code is taken as already verified.
source "$(dirname "$0")/_lib.sh"

if [[ "${1:-}" == "--fingerprint" ]]; then
  tree_fingerprint
  exit 0
fi

pending=()
for lane in "${LANES[@]}"; do
  fp="$(lane_fingerprint "$lane")"
  if [[ "$fp" == "$(lane_fingerprint "$lane" HEAD)" ]]; then
    state=clean
  elif [[ "$fp" == "$(cat "$OUT/$lane.stamp" 2>/dev/null)" ]]; then
    state=green
  else
    state=PENDING
    pending+=("$lane")
  fi
  [[ "${1:-}" == "--pending" ]] || printf '  %-13s %s\n' "$lane" "$state"
done

if [[ "${1:-}" == "--pending" ]]; then
  echo "${pending[*]}"
  exit 0
fi
for lane in "${ON_DEMAND[@]}"; do
  [[ "$(lane_fingerprint "$lane")" == "$(lane_fingerprint "$lane" HEAD)" ]] && state=clean ||
    { [[ "$(lane_fingerprint "$lane")" == "$(cat "$OUT/$lane.stamp" 2>/dev/null)" ]] && state=green || state="on demand"; }
  [[ "${1:-}" == "--pending" ]] || printf '  %-13s %s\n' "$lane" "$state"
done
[[ ${#pending[@]} -eq 0 ]]
