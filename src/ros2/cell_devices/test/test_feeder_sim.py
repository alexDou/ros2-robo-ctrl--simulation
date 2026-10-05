"""Controller-local FlexFeeder logic: seeded deck, spacing, placement only while the belt feeds."""

from collections import Counter

import pytest
from cell_devices.feeder_sim import FeederParams, FeederSim
from cell_devices.register_map import FeederCmd, FeederState

QUICK = FeederParams(cycle_s_range=(0.05, 0.1), emptying_s=0.0)


def _filled(seed: int = 1, params: FeederParams = QUICK) -> FeederSim:
    feeder = FeederSim(params)
    feeder.command(FeederCmd.FILL, seed)
    return feeder


def _drain(feeder: FeederSim, belt_speed_mm_s: float = 150.0, seconds: float = 400.0):
    """Run the feeder on a belt that feeds continuously; returns every placement."""
    feeder.command(FeederCmd.ENABLE, 0)
    placements, travel, dt = [], 0.0, 0.02
    for _ in range(int(seconds / dt)):
        travel += belt_speed_mm_s * dt
        placements += feeder.step(dt, feeding=True, travel_mm=travel)
    return placements


def test_starts_empty():
    feeder = FeederSim(QUICK)
    assert (feeder.state, feeder.remaining) == (FeederState.EMPTY, 0)


def test_fill_generates_the_seeded_deck_composition():
    placements = _drain(_filled(seed=3))

    assert len(placements) == 100
    intact = Counter(p.color for p in placements if p.intact)
    assert intact == {"WHITE": 30, "GREEN": 30, "BLUE": 30}
    assert sum(not p.intact for p in placements) == 10


def test_same_seed_same_order_different_seed_different_order():
    order = lambda seed: [(p.color, p.intact) for p in _drain(_filled(seed=seed))]  # noqa: E731
    assert order(5) == order(5)
    assert order(5) != order(6)


def test_fill_sets_remaining_and_ready_and_is_ignored_unless_empty():
    feeder = _filled()
    assert (feeder.state, feeder.remaining) == (FeederState.READY, 100)

    feeder.command(FeederCmd.FILL, 9)  # already loaded: no refill

    assert feeder.remaining == 100


def test_placements_keep_130mm_of_encoder_travel_apart():
    # A fast cycle must still be spaced by the controller, not by the cycle timer.
    placements = _drain(_filled(params=FeederParams(cycle_s_range=(0.01, 0.02), emptying_s=0.0)))

    counts = [p.encoder_counts for p in placements]
    gaps_mm = [(b - a) / 10.0 for a, b in zip(counts, counts[1:], strict=False)]
    assert gaps_mm and min(gaps_mm) >= 130.0 - 1e-6


def test_cycle_time_varies_between_placements():
    placements = _drain(_filled(params=FeederParams(cycle_s_range=(1.0, 4.0), emptying_s=0.0)))

    counts = [p.encoder_counts for p in placements]
    gaps = {round((b - a) / 10.0) for a, b in zip(counts, counts[1:], strict=False)}
    assert len(gaps) > 5


def test_no_placement_while_the_belt_is_not_feeding():
    feeder = _filled()
    feeder.command(FeederCmd.ENABLE, 0)

    placed = [p for i in range(500) for p in feeder.step(0.02, feeding=False, travel_mm=i * 3.0)]

    assert placed == []
    assert feeder.remaining == 100


def test_no_placement_while_disabled():
    feeder = _filled()
    feeder.command(FeederCmd.ENABLE, 0)
    feeder.command(FeederCmd.DISABLE, 0)

    placed = [p for i in range(500) for p in feeder.step(0.02, feeding=True, travel_mm=i * 3.0)]

    assert placed == []


def test_placement_sequence_counts_up_and_remaining_counts_down():
    feeder = _filled()
    placements = []
    feeder.command(FeederCmd.ENABLE, 0)
    for i in range(1, 400):
        placements += feeder.step(0.02, feeding=True, travel_mm=i * 3.0)
        if len(placements) >= 3:
            break

    assert [p.seq for p in placements] == [1, 2, 3]
    assert feeder.placement_count == 3
    assert feeder.remaining == 97
    assert feeder.state == FeederState.PLACING


def test_quick_empty_drops_the_deck():
    feeder = _filled()

    feeder.command(FeederCmd.QUICK_EMPTY, 0)
    feeder.step(0.02, feeding=False, travel_mm=0.0)

    assert (feeder.state, feeder.remaining) == (FeederState.EMPTY, 0)


def test_unknown_color_codes_are_not_exposed():
    assert {p.color for p in _drain(_filled())} <= {"WHITE", "GREEN", "BLUE"}


@pytest.mark.parametrize("cmd", [FeederCmd.ENABLE, FeederCmd.DISABLE])
def test_enable_disable_do_not_change_an_empty_feeder(cmd):
    feeder = FeederSim(QUICK)
    feeder.command(cmd, 0)
    assert feeder.state == FeederState.EMPTY
