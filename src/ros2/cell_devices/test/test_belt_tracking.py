"""Belt tracking: placement records + encoder travel reproduce where virtual_plc has each item."""

import pytest
from cell_devices.belt_sim import BeltSim
from cell_devices.belt_tracking import BeltTracker, batch, placement_seq
from cell_devices.feeder_sim import FeederParams, FeederSim
from cell_devices.flexfeeder import PlacementRecord
from cell_devices.register_map import BeltCmd, FeederCmd

from domain import BELT_X_RANGE, BELT_Y_RANGE

TOL_M = 0.001


def _record(seq: int, encoder_mm: float, lateral_mm: int = 0, intact: bool = True):
    return PlacementRecord(seq, lateral_mm, encoder_mm, "GREEN", intact)


def _tracker() -> BeltTracker:
    return BeltTracker(place_at_mm=FeederParams().place_at_mm)


def test_a_placed_gear_starts_at_the_feeder_and_travels_with_the_encoder():
    tracker = _tracker()
    tracker.add(_record(1, encoder_mm=100.0, lateral_mm=20))

    (at_feeder,) = tracker.gears(encoder_mm=100.0)
    (later,) = tracker.gears(encoder_mm=600.0)

    assert at_feeder.x == pytest.approx(sum(BELT_X_RANGE) / 2 + 0.02)
    assert at_feeder.y == pytest.approx(0.85)
    assert later.y == pytest.approx(0.85 - 0.5)
    assert (later.color, later.intact) == ("GREEN", True)


def test_ids_are_unique_across_the_16_bit_sequence_wrap():
    tracker = _tracker()
    tracker.add(_record(65535, 0.0))
    tracker.add(_record(1, 200.0))

    ids = [g.id for g in tracker.gears(encoder_mm=200.0)]

    assert len(set(ids)) == 2


def test_a_gear_past_the_belt_end_is_dropped():
    tracker = _tracker()
    tracker.add(_record(1, 0.0))
    length_mm = (BELT_Y_RANGE[1] - BELT_Y_RANGE[0]) * 1000.0

    assert len(tracker.gears(encoder_mm=100.0)) == 1
    assert tracker.gears(encoder_mm=length_mm) == []


def test_tracked_positions_match_the_plc_ground_truth_through_stops_and_restarts():
    belt, feeder = BeltSim(), FeederSim(FeederParams(cycle_s_range=(0.1, 0.4)))
    tracker = _tracker()
    feeder.command(FeederCmd.FILL, 7)
    feeder.command(FeederCmd.ENABLE, 0)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    dt, worst, seen = 0.02, 0.0, 0
    for step in range(int(120 / dt)):
        if step == 3000:  # restart after the eye stop, as a resumed run would
            belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
            feeder.command(FeederCmd.ENABLE, 0)
        belt.step(dt, scrap_home=True)
        for p in feeder.step(dt, belt.feeding, belt.travel_mm):
            belt.add_item(p.at_mm)
            tracker.add(
                PlacementRecord(p.seq, p.lateral_x_mm, p.encoder_counts / 10.0, p.color, p.intact)
            )
        tracked = sorted(g.y for g in tracker.gears(belt.travel_mm))
        truth = sorted(BELT_Y_RANGE[1] - pos / 1000.0 for pos in belt.item_positions_mm)
        assert len(tracked) == len(truth)
        seen = max(seen, len(truth))
        worst = max([worst, *(abs(a - b) for a, b in zip(tracked, truth, strict=True))])

    assert seen >= 3
    assert worst < TOL_M


def test_batch_is_the_gears_inside_the_pickzone_lead_first_and_upstream_ones_stay():
    tracker = _tracker()
    for seq, encoder_mm in enumerate((0.0, 500.0, 1000.0, 1200.0), start=1):
        tracker.add(_record(seq, encoder_mm))

    on_belt = tracker.gears(encoder_mm=1359.0)  # lead gear just inside the eye (y = -0.509)
    in_batch = batch(on_belt)

    assert len(on_belt) == 4
    assert [g.id for g in in_batch] == ["belt-1", "belt-2", "belt-3"]
    assert "belt-4" not in [g.id for g in in_batch]  # still upstream of the PickZone


def test_a_tracked_id_names_its_16_bit_placement_seq():
    """virtual_plc removes a picked Gearwheel by the placement seq inside its id (D35)."""
    tracker = _tracker()
    tracker.add(_record(65535, encoder_mm=0.0))
    tracker.add(_record(3, encoder_mm=200.0))  # past the wrap

    ids = [g.id for g in tracker.gears(encoder_mm=200.0)]

    assert [placement_seq(i) for i in ids] == [65535, 3]
    assert placement_seq("3f2a9c") is None  # a click-spawned gear never rode the belt
