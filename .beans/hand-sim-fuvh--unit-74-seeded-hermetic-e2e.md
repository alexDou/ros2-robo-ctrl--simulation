---
# hand-sim-fuvh
title: 'Unit 7.4: Seeded hermetic E2E'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:28Z
updated_at: 2026-09-25T09:47:00Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-7839
    - hand-sim-17xk
    - hand-sim-pn7u
    - hand-sim-lilk
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As a test engineer, I want hermetic end-to-end runs driven by a seeded classification sequence instead of randomness, so that click-to-stack, click-to-bin, FIFO, icon flips, and latency are deterministic and reproducible inside the sandbox.

## Acceptance criteria

- [x] Mock Gateway mirrors the seeded classification sequence; no real randomness, runs never cross sandbox borders
- [x] Full click grey-to-stack loop and click grey-to-bin loop pass
- [x] Per-tower FIFO at 10 and bin icon flip on first defective arrival covered
- [x] Clear-to-empty reset covered
- [x] Click-to-echo latency under 50ms asserted

## Blocked by

- hand-sim-7839 (Unit 7.3b recolor-on-echo)
- hand-sim-17xk (Unit 7.3c bin fixture)
- hand-sim-pn7u (Unit 7.3d notch)
- hand-sim-lilk (Unit 7.3e FIFO + Clear)

## Summary of Changes

Seeded hermetic E2E green: mock mirrors classification sequence (deterministic gear-seed-N ids, wrap replay, WHITE/sound default), per-tower FIFO + bin cap-100 recycle mirror WorkcellNode, CLEAR wipes all buckets, click-to-echo <50ms. 9 seeded tests + 11 legacy + 211 full suite pass; typecheck + lint clean.
