---
name: verify
description: Run the end-of-task quality gate lane by lane, one lane per part of the system (contracts codegen drift, gateway fmt/clippy/nextest, edge ruff/colcon/pytest, teleop-client oxfmt/oxlint/typecheck/vitest, semgrep), only the lanes the change touches, one at a time, and fix failures until each is green. Use at the end of every task that changed files, before reporting done or committing.
---

# Verify

Each lane is one part of the system with its own script in `scripts/verify/`. It tests that part in isolation, with mocks at the contract borders:

| Lane | Part (CONTEXT.md) | Checks |
|---|---|---|
| `contracts` | generated domain types | `generate_domain.py --check` |
| `gateway` | Gateway | cargo fmt, clippy, nextest |
| `edge` | EdgeNode / ROS2 packages | ruff, colcon build, package pytest |
| `teleop-client` | TeleopClient | oxfmt, oxlint, typecheck, vitest |
| `semgrep` | trust boundaries | semgrep rules |
| `launch` | whole SIM system (SystemLauncher) | full cell flow, ~8 min. **On demand only**, never required |

1. See which lanes the change touches:

   ```bash
   scripts/verify/status.sh
   ```

   Each lane shows `clean` (same as HEAD, nothing to run), `green` (passed on these exact files) or `PENDING`. `launch` shows `on demand` instead of PENDING.

2. Run each PENDING lane **on its own, one after the other**, never in parallel. Run `contracts` first, because the other lanes build on the generated types:

   ```bash
   scripts/verify/contracts.sh
   scripts/verify/edge.sh   # etc.: gateway, teleop-client, semgrep
   ```

- Every step in a lane runs even if an earlier one fails. The lane ends with `verify <lane>: GREEN` or `RED (<failed steps>)`. Full log: `.verify/<lane>.log`.
- Workers per lane: `VERIFY_JOBS`, which defaults to half the CPUs. The lanes run at low priority.
- A green run writes `.verify/<lane>.stamp`. The Claude Stop hook compares each touched lane against its stamp, so any later edit to that lane's files makes it PENDING again.
- Parallel lanes belong in CI only, as separate jobs in its config.
- `scripts/verify/launch.sh` and the web Cucumber E2E run only when the user asks, alone.

## Fix loop

1. Read only the failing lane's log (`.verify/<lane>.log`).
2. Formatting failures → apply the formatter, don't hand-edit:
   - `cargo fmt --all`
   - `ruff format . && ruff check --fix .`
   - `npm --prefix web run format`
3. Contracts drift → edit `schemas/*.schema.json`, run `python3 scripts/generate_domain.py`. Never edit `src/domain/domain.{py,rs}` or `web/domain/contracts.ts` by hand.
4. Test/lint/semgrep failures → fix the root cause. Never weaken a test, add a blanket `#[allow]`/`# noqa`/`oxlint-disable`, or loosen `.semgrep/robot-security.yml` to get green without the user's OK.
5. Re-run only that lane until it prints GREEN.

## Reporting

- Report each lane's final line verbatim.
- If a failure is pre-existing and unrelated to this task (the failing file/test is not in `git diff`), say so explicitly and name it. Never claim GREEN while any touched lane is RED.
