---
# hand-sim-u2tx
title: 'Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)'
status: todo
type: epic
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:19:09Z
updated_at: 2026-09-23T17:30:59Z
blocked_by:
    - hand-sim-9kw2
    - hand-sim-c682
    - hand-sim-473u
    - hand-sim-6n92
    - hand-sim-3gmi
    - hand-sim-7839
    - hand-sim-17xk
    - hand-sim-pn7u
    - hand-sim-lilk
---

## Problem Statement

Operators sorting Gearwheels today have only one destination: every Gearwheel lands on a single SpindleTower regardless of color or condition. There is no quality gate — cracked or defective Gearwheels pile onto the good stack — and no way to sort WHITE, GREEN, and BLUE Gearwheels to separate SpindleTowers or to divert defective ones to a ScrapBin. The TeleopClient shows every Gearwheel grey, so the operator gets no visual feedback about classification, tower fill per color, or whether the ScrapBin holds anything.

## Solution

Introduce a simulated quality-and-color classification step at spawn time plus four-destination routing. A click on the WorkcellTable still places an initially grey Gearwheel; the Gateway enriches the spawn with an assigned color (WHITE, GREEN, or BLUE) and a defective flag (roughly 20% defective). The authoritative WorkcellState persists the classification and routes each Gearwheel: sound Gearwheels to the SpindleTower matching their color, defective ones to the ScrapBin regardless of color. The TeleopClient recolors each Gearwheel on the authoritative echo (with a visible crack notch when defective), shows per-tower fill counters, and shows the ScrapBin as an OS-trash-style empty versus non-empty indicator with no numeric count. Nothing about frequencies, throttling, render rate, lifecycle states, or transport channels changes.

## User Stories

1. As an operator, I want a clicked table point to first show a grey unclassified Gearwheel, so that I get instant placement feedback before classification lands.
2. As an operator, I want the grey Gearwheel to recolor to WHITE, GREEN, or BLUE on the authoritative echo, so that I can see what the quality gate decided.
3. As an operator, I want defective Gearwheels to carry a visible crack notch, so that I can tell at a glance why one went to scrap.
4. As an operator, I want sound WHITE Gearwheels to land on the white SpindleTower, so that colors stay separated.
5. As an operator, I want sound GREEN Gearwheels to land on the green SpindleTower, so that colors stay separated.
6. As an operator, I want sound BLUE Gearwheels to land on the blue SpindleTower, so that colors stay separated.
7. As an operator, I want defective Gearwheels of any color to land in the ScrapBin, so that bad parts never contaminate a good tower.
8. As an operator, I want per-tower counters showing fill against capacity (n/10), so that I know when a tower is nearly full.
9. As an operator, I want the ScrapBin shown as empty versus non-empty with no count, so that the display stays as simple as an OS trash icon.
10. As an operator, I want each tower to hold at most 10 Gearwheels with oldest-bottom FIFO eviction on overflow, so that stacking stays bounded and predictable.
11. As an operator, I want the ScrapBin to accept unlimited defective Gearwheels without overflow logic, so that rejects are never blocked.
12. As an operator, I want ClearWorkspace to wipe all three towers plus the ScrapBin and reset every counter and the bin icon, so that I can restart a run cleanly.
13. As an operator, I want ClickLockout to keep working exactly as today while a Gearwheel is active, so that placement discipline does not regress.
14. As an operator, I want classification results reported through the existing inference metrics channel, so that downstream consumers see WHITE, GREEN, BLUE, or DEFECTIVE labels.
15. As a simulation engineer, I want the classifier behind a one-function plugin seam with a random stub today, so that a real vision service can replace it later with a one-line wiring change.
16. As a simulation engineer, I want roughly 20% of spawns flagged defective, so that the scrap path gets exercised in normal runs.
17. As a test engineer, I want hermetic end-to-end runs driven by a seeded classification sequence rather than randomness, so that sorting behavior is deterministic and reproducible.
18. As a test engineer, I want tower routing, per-tower FIFO, defect-to-bin routing, and full clearing each covered by isolated module tests, so that regressions point at the right subsystem.
19. As a maintainer, I want tower slot math unchanged per tower (slot height equals index times step), so that stacking visuals stay consistent with prior behavior.
20. As a maintainer, I want no changes to command rate limits, telemetry cadence, render approach, lifecycle states, or transport channels, so that Unit 7 cannot destabilize settled real-time behavior.

## Implementation Decisions

- Classification ownership: the Gateway enriches each spawn command with color and defective flag via a pure function on the spawn path only; the WorkcellNode remains the single owner of authoritative truth and persists whatever classification arrives.
- Classifier seam: one new seam total — a classifier interface with a random stub (20% defect rate) in production and a seeded deterministic mock under test. Replacing the stub with a real inspection service means implementing the interface and changing one wiring line; no other Gateway logic (rate limiting, session exclusivity, telemetry handling, pick-and-place routing) is touched.
- Deterministic color assignment: the stub assigns WHITE, GREEN, or BLUE with equal probability, independent of the defective roll, so color coverage and defect coverage are both exercised over a run.
- Domain contract extension: the spawn command payload and the Gearwheel entry shape each gain an optional color field (defaulting to WHITE for backward compatibility) and an optional defective flag (defaulting to false). The processed collection stays a single flat list; per-tower counts and the bin empty/non-empty state are derived by filtering, not by introducing sub-bucket containers.
- Workcell service contract extension: the spawn and drop-slot reservation requests each gain color plus defective flag with WHITE/false defaults, so existing callers keep working. The drop-slot response shape is unchanged.
- Routing rule: defective flag dominates color — any defective Gearwheel reserves and commits to the ScrapBin at the next pile position with no capacity cap and no overflow ever reported. Sound Gearwheels reserve and commit to the tower matching their color with slot height derived from that tower's own fill count.
- Per-tower capacity: each SpindleTower holds 10; the 11th arrival to the same tower evicts that tower's oldest bottom Gearwheel and shifts the rest down one slot, leaving the counter at 10. Towers are independent — one full tower never affects another tower or the bin.
- Tower placement coordinates: WHITE keeps the long-established tower position; GREEN, BLUE, and the ScrapBin each receive fixed canonical coordinates locked in the domain contract constants.
- Spawned-table behavior: a spawn is still rejected while any Gearwheel is active on the table or in transit; classification fields ride along on the stored table entry so a later grasp preserves them through to the drop commit.
- Snapshot transport: the existing 1 Hz authoritative snapshot carries the new classification fields with no channel, topic, cadence, or shape changes beyond the two added fields.
- TeleopClient recolor-on-echo: table Gearwheels render grey until the authoritative snapshot echo arrives, then adopt their classified color and notch state matched by gear identifier; processed Gearwheels render at their tower or bin positions by the same classification.
- Tower visuals: the existing tower builder is parameterized by color and instantiated three times; the ScrapBin is a distinct open-box/chute fixture with exactly two visual states (empty, has-items).
- Counters: three numeric tower counters (n/10) plus one binary bin icon derived from the flat processed list; no scrap count appears anywhere in UI, telemetry display, or test assertions beyond presence versus absence.
- Classification reporting: the existing inference-metrics detected-object label carries the classification outcome (color name, or DEFECTIVE), reusing the established channel rather than adding a new one.
- Backward compatibility: all new fields are optional with safe defaults at every layer (schema, generated bindings, services, UI builders), so old payloads, old callers, and old snapshots validate and render without migration.

## Testing Decisions

- What makes a good test here: assert externally observable behavior (echoed color, notch presence, drop coordinates, counter text, bin icon state, slot math) rather than implementation internals (which helper computed the slot, how the mesh was constructed, RNG call counts).
- Domain contract layer: cross-language serialization round-trip tests covering the new color and defective fields, including defaults when fields are absent — prior art is the existing cross-language contract test suite for spawn and telemetry shapes.
- Gateway classifier layer: distribution test asserting roughly 20 defective flags per 100 classifications within tolerance, plus determinism test asserting the seeded mock replays its fixed sequence exactly — prior art is the existing Gateway validation and rate-limit test suite.
- Workcell layer: routing tests (sound color goes to matching tower coordinates, defective of any color goes to bin), per-tower FIFO tests (11th arrival evicts oldest, counter pins at capacity, sibling towers unaffected), bin tests (uncapped pile positions increment, overflow never set), and clearing tests (all four destinations wiped, snapshot empty) — prior art is the existing WorkcellNode bucket and slot test suite.
- TeleopClient layer: recolor-on-echo tests (grey becomes classified color on snapshot), notch tests (defective shows crack marker), counter tests (n/10 per tower), bin-icon tests (empty versus non-empty toggle, no numeric count), and clear tests (all visuals reset) — prior art is the existing TeleopClient snapshot-reconciliation and tower-render test suite.
- End-to-end layer: hermetic seeded runs through a mock Gateway asserting full click-to-stack and click-to-bin loops, per-tower FIFO at 10, bin icon flip on first defective arrival, clear-to-empty reset, and sub-50ms click-to-echo latency — prior art is the existing hermetic mock-Gateway end-to-end suite, extended with a seeded classification mirror sequence. End-to-end runs never touch real randomness and never cross their sandbox borders.

## Out of Scope

- Any change to command rate limits, telemetry cadence, render loop rate, throttling approach, lifecycle states, or transport channels and topics.
- A real vision or ONNX classifier — the rule-based stub plus plugin seam is the whole Unit 7 classifier story.
- Conveyor feeding or pickup-station stepping (reserved for a later unit).
- Numeric ScrapBin counts, bin capacity caps, bin overflow visuals, or bin FIFO eviction.
- Sub-bucket containers in the processed collection; counts stay derived from the flat list.
- New ROS service response shapes, new WebSocket frame types, or new DataFabric channels.
- Migration of old payloads or snapshots beyond optional-field defaults.
- Changes to pick-and-place trajectory generation, grasp proximity thresholds, or home-return behavior.

## Further Notes

- The operator phrase driving the bin design is "like the trash icon on an OS": either empty or holding something, never a number.
- The "sub-buckets" wording from early discussion was deliberately replaced by flat-list-plus-derived-counts to honor the freeze on data-flow changes; specs and tickets should use the derived-counts vocabulary.
- The stale roadmap block for this unit still shows pre-decision values (old counters, old capacity math, ONNX classifier); the unit spec directory docs carry the corrected values and supersede it.
