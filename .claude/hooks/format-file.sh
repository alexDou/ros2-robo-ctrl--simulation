#!/usr/bin/env bash
# PostToolUse(Write|Edit): format the edited file with the project formatter for its extension.
# Generated contract files are skipped so `scripts/generate_domain.py --check` stays stable.
set -uo pipefail
f="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"
[[ -n "$f" && -f "$f" ]] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
case "$f" in
  */src/domain/domain.rs | */src/domain/domain.py | */web/domain/contracts.ts) exit 0 ;;
  *.rs) rustfmt --edition 2021 --config-path "$root/rustfmt.toml" "$f" ;;
  *.py) ruff format --force-exclude --quiet "$f" ;;
  "$root"/web/*.ts | "$root"/web/*.tsx | "$root"/web/*.js | "$root"/web/*.json | "$root"/web/*.css)
    (cd "$root/web" && node_modules/.bin/oxfmt --no-error-on-unmatched-pattern "$f" >/dev/null) ;;
esac
