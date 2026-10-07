---
# hand-sim-bciq
title: 'Gate: verify.sh starves the machine and looks hung; cap parallelism, live progress, isolated ROS domain'
status: completed
type: bug
priority: critical
tags:
    - ready-for-human
created_at: 2026-10-07T16:57:02Z
updated_at: 2026-10-07T20:21:21Z
parent: hand-sim-rqpy
---

## Problem (reported 2026-10-07)
`scripts/verify.sh` saturates the machine (8 cores, 23 GB, with the IDE and rust-analyzer also running) and prints nothing for minutes, so it looks hung. The user stopped every run. **Do not run verify.sh to "check" this bean until the fix is in, and never run it alongside the full-flow launch test or a live SIM.**

## Cause (read from the script; verify.sh itself unchanged since 1158fe4)
- Lines 117-124: the rust, python and web lanes start in parallel, and each sizes itself to all cores:
  - rust: `cargo clippy` + `cargo nextest` (jobs = nproc);
  - python: `colcon build` of every package (parallel workers = nproc), then pytest with real ROS nodes plus `test_virtual_plc_launch.py`;
  - web: `vitest` (workers ~ nproc).
  That is about 3× oversubscription.
- `run()` (line 88) sends all lane output to `.verify/<lane>.log`; the terminal shows only the final summary.
- The ROS pytest lane uses the default `ROS_DOMAIN_ID`, so a running SIM or launch test interferes with it. On 2026-10-07 `test_reset_exchanges_only_the_non_empty_pallets_and_the_bin` failed exactly once, during a concurrent launch test; alone it passed 3/3.

## Proposed fix (needs the user's OK before editing; they asked to review the script)
1. Cap parallelism to about nproc/2: `CARGO_BUILD_JOBS`, `nextest -j`, `colcon build --parallel-workers`, `vitest --maxWorkers`. Or run rust and python one after the other, and only web in parallel.
2. Live progress: tee each `▶ step` / `✖` line to the terminal while keeping the full logs.
3. Run the python lane on its own `ROS_DOMAIN_ID` (e.g. 77), unless one is already set.
4. Optional: `colcon build --packages-select` only the changed packages.
Keep the Stop-hook contract: write the fingerprint stamp on GREEN, and `--fingerprint` stays unchanged.

## Acceptance
With the user's OK, one run: the desktop stays responsive, progress is visible, and the result is `verify: GREEN` on the current tree. That run also stamps commits dd2f7aa..HEAD, which were pushed without a GREEN gate at the user's request.


## Progress 2026-10-07 (session 2): fix written, NOT run
Stashed as `git stash list` -> 'hand-sim-bciq WIP: verify.sh ...' (restore with `git checkout 'stash@{N}' -- scripts/verify.sh` where N is this stash's index: `stash^{/...}` searches commit history, not the stash list, and silently matches a commit instead). Applied to the working tree 2026-10-07 session 3.
Done in scripts/verify.sh: VERIFY_JOBS (default nproc/2) -> CARGO_BUILD_JOBS, nextest -j, colcon --parallel-workers, vitest --minWorkers=1 --maxWorkers (vitest 1.6 needs both flags, checked); rust then python serially, web beside them; renice 10; ROS_DOMAIN_ID=77 default for the python lane; run() tees ▶/✖ lines to the terminal prefixed [lane]; status of the serial pair via .verify/serial.status. --fingerprint and stamp unchanged.
Left: user reviews the diff, OKs, then ONE run (acceptance above). bash -n passes; shellcheck is not installed.


## Done 2026-10-07 (session 3): replaced by per-lane scripts (user's design)
The user rejected the single parallel gate: lanes are for CI, where the config runs them in parallel. scripts/verify.sh is deleted. scripts/verify/{codegen,rust,python,web,semgrep}.sh each run one lane alone (VERIFY_JOBS = nproc/2, nice 10, python on ROS_DOMAIN_ID 77, progress on the terminal, log in .verify/<lane>.log, .verify/<lane>.stamp on GREEN). scripts/verify/status.sh lists the lanes the change touches (clean/green/PENDING), and the Stop hook blocks only on PENDING lanes. CLAUDE.md, AGENTS.md, the verify skill and the permissions are updated. First run, one lane at a time: all five GREEN (python 70+406 tests, web 291, rust 46). stash@{1} (old verify.sh fix) is obsolete.


Renamed lanes after system parts (user): contracts, gateway, edge, teleop-client, semgrep; plus launch.sh (the full-flow test, on demand, never required by the hook).
