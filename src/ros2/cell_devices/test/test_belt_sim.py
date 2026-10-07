"""BeltSim: controller-local belt logic (ramps, 32-bit encoder, eye stop, exit counter)."""

import pytest
from cell_devices.belt_sim import BeltParams, BeltSim
from cell_devices.register_map import BeltCmd, BeltState

DT = 0.01
FAST = BeltParams(speed_mm_s=1000.0, accel_mm_s2=5000.0, counts_per_mm=10.0)


def _run_until(belt, predicate, limit_s=30.0):
    t = 0.0
    while not predicate() and t < limit_s:
        belt.step(DT, scrap_home=True)
        t += DT
    assert predicate(), f"timed out in state {belt.state}"


def test_drive_ramps_instead_of_jumping_to_speed():
    belt = BeltSim(FAST)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)

    belt.step(DT, scrap_home=True)
    assert 0 < belt.velocity_mm_s < FAST.speed_mm_s

    _run_until(belt, lambda: belt.velocity_mm_s == FAST.speed_mm_s)


def test_encoder_is_32_bit_and_wraps():
    belt = BeltSim(BeltParams(speed_mm_s=1000.0, accel_mm_s2=1e6, counts_per_mm=1e6))
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)

    for _ in range(5):  # 5000 mm * 1e6 counts/mm > 2**32
        belt.step(1.0, scrap_home=True)

    assert 0 <= belt.encoder_counts < 2**32
    assert belt.encoder_counts != int(belt.travel_mm * 1e6)


def test_belt_stops_at_the_eye_by_itself():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)

    assert belt.velocity_mm_s == 0.0
    (pos,) = belt.item_positions_mm
    assert FAST.eye_mm <= pos < FAST.eye_mm + 2 * FAST.braking_distance_mm


def test_next_run_leaves_the_item_at_the_eye_and_stops_at_the_next():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0)
    belt.add_item(at_mm=-300.0)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)
    first_stop = belt.travel_mm

    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    assert belt.state == BeltState.RUNNING
    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)

    assert belt.travel_mm - first_stop >= 300.0 - 1e-6


def test_exit_counter_latches_every_item_without_being_read():
    belt = BeltSim(FAST)
    for i in range(5):
        belt.add_item(at_mm=-100.0 * i)
    belt.command(BeltCmd.FLUSH, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.FLUSH_DONE)

    assert belt.exit_count == 5
    assert belt.item_positions_mm == []


def test_exit_count_wraps_at_16_bit():
    belt = BeltSim(FAST)
    belt.exit_count = 0xFFFF
    belt.add_item(at_mm=0.0)
    belt.command(BeltCmd.FLUSH, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.FLUSH_DONE)

    assert belt.exit_count == 0


def test_flush_of_an_empty_belt_is_done_immediately():
    belt = BeltSim(FAST)

    belt.command(BeltCmd.FLUSH, scrap_home=True)

    assert belt.state == BeltState.FLUSH_DONE
    assert belt.velocity_mm_s == 0.0


@pytest.mark.parametrize("cmd", [BeltCmd.RUN_TO_PICKZONE, BeltCmd.FLUSH])
def test_belt_refuses_to_move_while_the_scrap_bin_is_away(cmd):
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0)

    belt.command(cmd, scrap_home=False)
    for _ in range(50):
        belt.step(DT, scrap_home=False)

    assert belt.state == BeltState.HELD_BIN_AWAY
    assert belt.velocity_mm_s == 0.0
    assert belt.travel_mm == 0.0


def test_stop_ramps_down_to_idle():
    belt = BeltSim(FAST)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    _run_until(belt, lambda: belt.velocity_mm_s == FAST.speed_mm_s)

    belt.command(BeltCmd.STOP, scrap_home=True)
    assert belt.state == BeltState.RUNNING  # still decelerating
    _run_until(belt, lambda: belt.state == BeltState.IDLE)

    assert belt.velocity_mm_s == 0.0


def test_finish_run_carries_the_upstream_item_on_to_the_eye():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    belt.step(0.01, scrap_home=True)

    belt.command(BeltCmd.FINISH_RUN, scrap_home=True)

    assert not belt.feeding  # the FlexFeeder may not place any more
    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)


def test_finish_run_with_nothing_upstream_of_the_eye_ends_the_run_at_once():
    belt = BeltSim(FAST)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    belt.step(0.01, scrap_home=True)

    belt.command(BeltCmd.FINISH_RUN, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)
    assert belt.velocity_mm_s == 0.0


def test_finish_run_lets_a_flush_run_out():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0)
    belt.command(BeltCmd.FLUSH, scrap_home=True)
    belt.step(0.01, scrap_home=True)

    belt.command(BeltCmd.FINISH_RUN, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.FLUSH_DONE)
    assert belt.exit_count == 1


# --- D35: only an intact Gearwheel still on the belt stops it at the eye ---


def test_a_defective_rides_past_the_eye_into_the_bin_on_the_first_run():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0, intact=False)
    belt.add_item(at_mm=-300.0, intact=True)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)

    (intact,) = belt.item_positions_mm  # the defective has fallen off the end
    assert belt.exit_count == 1
    assert FAST.eye_mm <= intact < FAST.eye_mm + 2 * FAST.braking_distance_mm


def test_a_picked_gearwheel_no_longer_stops_the_next_run():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0, seq=1)
    belt.add_item(at_mm=-1000.0, seq=2)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)

    belt.remove_item(seq=1)  # the arm took the Batch off the belt
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)

    (pos,) = belt.item_positions_mm  # the next intact one came the full way to the eye
    assert FAST.eye_mm <= pos < FAST.eye_mm + 2 * FAST.braking_distance_mm
    assert belt.exit_count == 0  # a picked Gearwheel never reaches the exit eye


def test_finish_run_with_only_defectives_upstream_ends_the_run_at_once():
    belt = BeltSim(FAST)
    belt.add_item(at_mm=0.0, intact=False)
    belt.command(BeltCmd.RUN_TO_PICKZONE, scrap_home=True)
    belt.step(0.01, scrap_home=True)

    belt.command(BeltCmd.FINISH_RUN, scrap_home=True)

    _run_until(belt, lambda: belt.state == BeltState.STOPPED_AT_EYE)
    assert belt.item_positions_mm  # still on the belt: the final flush takes it
