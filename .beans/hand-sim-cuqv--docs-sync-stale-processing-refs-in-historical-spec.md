---
# hand-sim-cuqv
title: 'Docs: sync stale PROCESSING refs in historical specs'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T11:04:36Z
updated_at: 2026-09-21T11:21:51Z
parent: hand-sim-4814
---

Follow-up to hand-sim-jqtr (done, e80962b). Historical spec docs still describe IDLE->PROCESSING->EXECUTING, contradicting 5-state contract (BOOTING/STANDBY/IDLE/EXECUTING/FAULT). Stale files: support_files/specs/paradigm.md:29, unit4/overview.md:3 + implementation_wireframe.md:103,106-107,177, unit6/overview.md:8 + implementation_wireframe.md:117,129,188, units.md:93,105,117,154, system_architecture_overview.md:254-257, iterations/iter-2.txt:35,88. Decide per file: annotate superseded-by-6.6.0 vs rewrite. Accept: each file updated or marked historical; grep PROCESSING in support_files returns zero unmarked hits.

## Summary of Changes

Annotated 8 historical files with HISTORICAL-SUPERSEDED-BY-6.6.0 banner (PROCESSING refs stale per jqtr e80962b; contract BOOTING/STANDBY/IDLE/EXECUTING/FAULT). Files: paradigm.md, unit4/overview.md, unit4/implementation_wireframe.md, unit6/overview.md, unit6/implementation_wireframe.md, units.md, system_architecture_overview.md, iterations/iter-2.txt. All PROCESSING hits now in marked files; history kept, do not implement.
