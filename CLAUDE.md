# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## End-of-task gate

- Finish every file-changing task with `/verify` (runs `scripts/verify.sh`). Don't say "done" or commit until it prints `verify: GREEN`. A Stop hook blocks ending a turn while the working tree differs from the last green run.
- Edited files are auto-formatted by a PostToolUse hook: rustfmt, `ruff format` or oxfmt, chosen by file extension.

## Commands that aren't obvious

- ROS2 build: `source /opt/ros/jazzy/setup.bash && colcon build --symlink-install && source install/setup.bash`. The colcon workspace is the repo root.
- Python tests need the ROS env sourced. Run the ROS package tests in-package: `python3 -m pytest src/ros2/workcell_manager/test/ src/ros2/arm_controller/test/`. The `tests/test_{arm_controller,edge_bridge_*,workcell_node,robot_nodes_launch}.py` files are symlinks to those, and they fail when collected from the root.
- Single tests:
  - Rust: `cargo nextest run -E 'test(name)' --no-capture`
  - Python: `python3 -m pytest path::test_name`
  - Web: `npx --prefix web vitest run tests/unit/<file>.test.ts`
- Each new file in `src/gateway/tests/` needs its own `[[test]]` entry in `src/gateway/Cargo.toml`.
- Web E2E is Cucumber + Playwright (`npm --prefix web run test:e2e`), not the Playwright runner. Ignore `test:e2e:live` and `@live` scenarios for now.
- **Web E2E stops at the TeleopClient boundary.** It never touches the Gateway, Zenoh or ROS2: the communication layer is always mocked (mock gateway). So an E2E failure can only come from web code or the mock, never from the real Gateway, and E2E can never confirm or refute a Gateway/ROS2 bug. Gateway behaviour is proven by `cargo nextest` (`src/gateway/tests/`); never propose E2E (or a "replay against the real gateway") as a check on it.

## Codegen

- `src/domain/domain.py`, `src/domain/domain.rs` and `web/domain/contracts.ts` are generated. Never hand-edit them: change `schemas/*.schema.json`, then run `python3 scripts/generate_domain.py`.
- Formatters skip these files: `#[rustfmt::skip]` in `src/gateway/src/lib.rs`, ruff `extend-exclude`, and oxfmt `ignorePatterns`. Keep it that way, or `--check` will report drift.

## Rules by path (in `.agents/rules/`; read the matching file before editing)

- `src/**/*.rs` → `rust.md`
- `web/**/*.{ts,tsx}` in the 3D scene → `threejs-rep103.md`
- Python or Rust crossing the Zenoh boundary → `telemetry-contract.md`
- Any claim about loop rates or frequencies → `pipeline-rates.md`. Read it first; don't re-ask the user.
- File placement → `structure.md`
- Ignore `tool-params.md` (Antigravity tool names only).

## Workflow

- Commits: `type(scope): summary (hand-sim-xxxx)`, using the bean ID. Scopes seen so far: web, gateway, workcell, sim, domain, edge, planning, security, img-read. Tracker-only commits use `chore(tracker): <id> completed`.
- Branches: `type/slug` off `main`, e.g. `security/semgrep-trust-boundary-fixes`.
- Beans: `beans list --json --ready`, `beans show <id>`, `beans update <id> -s in-progress|completed --body-append "..."`.
- Skills live in `.agents/skills/`, shared with Antigravity; `.claude/skills` is a symlink to it. Add new skills there.
