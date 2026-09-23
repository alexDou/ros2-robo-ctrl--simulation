---
# hand-sim-9kw2
title: 'Unit 7.0: Domain contracts — color + defective flag'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:21:59Z
updated_at: 2026-09-23T19:21:45Z
parent: hand-sim-u2tx
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As a foundation for all Unit 7 sorting work, extend the domain contracts so every Gearwheel can carry a color (WHITE, GREEN, or BLUE) and a defective flag. Old payloads without the new fields keep validating and default to WHITE and not-defective, so nothing already running breaks. Regenerate the Python, Rust, and TypeScript bindings from the schemas — never hand-edit generated types.

## Acceptance criteria

- [ ] Spawn command payload accepts optional color (WHITE/GREEN/BLUE) and optional defective flag, both with safe defaults, rejected values fail validation
- [ ] Gearwheel entry in telemetry snapshots carries the same two fields with the same defaults
- [ ] Python, Rust, and TypeScript bindings regenerated from schemas and round-trip the new fields including absent-field defaults
- [ ] Per-tower coordinates and capacity constants locked in the contract (WHITE keeps established position; GREEN, BLUE, ScrapBin fixed)
- [ ] Existing contract tests still pass unmodified

## Blocked by

- None (can start immediately)

## Summary of Changes

Schemas carry optional color (WHITE/GREEN/BLUE, default WHITE) + defective (default false) on spawn payload and all 3 GearEntry buckets; legacy payloads validate with safe defaults, RED rejected. Tower consts locked: WHITE (0.40,-0.30,0.0), GREEN (0.55,-0.30,0.0), BLUE (0.70,-0.30,0.0), SCRAP_BIN (0.40,0.28,0.0), TOWER_CAPACITY 10, STACK_STEP_M 0.02. Generator extended: enum defaults + typed int/float/array consts; bindings regen'd via generate_domain.py (--check clean). Tests: 19 py, 19 rust contract, 55 ts contract, 185 web, cargo check/clippy clean.
