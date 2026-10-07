---
# hand-sim-bciq
title: 'Gate: verify.sh starves the machine and looks hung; cap parallelism, live progress, isolated ROS domain'
status: todo
type: bug
priority: critical
tags:
    - ready-for-human
created_at: 2026-10-07T16:57:02Z
updated_at: 2026-10-07T16:57:02Z
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
