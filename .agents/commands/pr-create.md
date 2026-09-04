---
description: "Runs quality gates, generates structured summary, and opens a GitHub PR"
---
1. Check current branch:
   Ensure current branch is not `main` or `master`.
2. Run pre-flight verification:
   - `cargo clippy --workspace --all-targets -- -D warnings`
   - `cargo nextest run --workspace`
   - `npm --prefix web run typecheck`
   Stop execution immediately if any check fails.
3. Check for API breaking changes:
   Run `cargo semver-checks check-release` if package versions are not bumped.
4. Push current branch to remote:
   `git push -u origin HEAD`
5. Generate PR description using the template from `.agents/skills/pr-toolkit/SKILL.md`.
6. Open the PR via GitHub CLI:
   `gh pr create --title "<type>(<scope>): <summary>" --body "<generated_body>"`
7. Return the resulting PR URL.

