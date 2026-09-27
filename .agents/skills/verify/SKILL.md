---
name: verify
description: Run the full end-of-task quality gate (codegen drift, Rust fmt/clippy/nextest, Python ruff/colcon/pytest, web oxfmt/oxlint/typecheck/vitest, semgrep) and fix failures until green. Use at the end of every task that changed files, before reporting done or committing.
---

# Verify

Run the gate:

```bash
scripts/verify.sh
```

- Lanes: `codegen` first (all others depend on generated contracts), then `rust`, `python`, `web` **in parallel**, then `semgrep`. Takes ~30–60 s.
- Every step in a lane runs even if an earlier one fails; the summary lists each `✖` step. Full logs: `.verify/<lane>.log`.
- Green run writes `.verify/stamp` (working-tree fingerprint). The Claude Stop hook compares against it — any later edit makes the tree "unverified" again.

## Fix loop

1. Read only the failing lane's log (`.verify/<lane>.log`), not all of them.
2. Formatting failures → apply the formatter, don't hand-edit:
   - `cargo fmt --all`
   - `ruff format . && ruff check --fix .`
   - `npm --prefix web run format`
3. Codegen drift → edit `schemas/*.schema.json`, run `python3 scripts/generate_domain.py`. Never edit `src/domain/domain.{py,rs}` or `web/domain/contracts.ts` by hand.
4. Test/lint/semgrep failures → fix the root cause. Never weaken a test, add a blanket `#[allow]`/`# noqa`/`oxlint-disable`, or loosen `.semgrep/robot-security.yml` to get green without the user's OK.
5. Re-run `scripts/verify.sh` until `verify: GREEN`.

## Reporting

- Report the final summary verbatim (PASS/FAIL per lane).
- If a failure is pre-existing and unrelated to this task (the failing file/test is not in `git diff`), say so explicitly and name it — never claim GREEN while any lane is FAIL.
