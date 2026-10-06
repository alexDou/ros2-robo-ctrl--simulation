"""Cell controller register map, shared by device nodes and virtual_plc.

Spec: support_files/specs/unit9/implementation_wireframe.md (Cell Controller Register Map).
Every command word has a matching sequence register; the controller echoes the last
executed sequence in the paired ack register. Bump MAP_VERSION on any layout change:
the controller reports it in input register `map_version` so a mismatched peer is
detected on connect.
"""

from enum import IntEnum, IntFlag

MAP_VERSION = 1


class BeltCmd(IntEnum):
    NONE = 0
    RUN_TO_PICKZONE = 1
    FLUSH = 2
    STOP = 3
    FINISH_RUN = 4  # Stop (D30): no more placing; on to the eye, or done if nothing is upstream


class CellCmd(IntEnum):
    NONE = 0
    FREEZE = 1
    RELEASE_FREEZE = 2
    FAULT_ACK = 3


class Interlock(IntFlag):
    """`interlocks` input word: a cleared bit is a condition the cell must not run with."""

    BIN_HOME = 1
    FEEDER_OK = 2
    DRIVES_OK = 4
    ESTOP_CHAIN_OK = 8  # LIVE: the hardwired safety chain is closed


class BeltState(IntEnum):
    IDLE = 0
    RUNNING = 1
    STOPPED_AT_EYE = 2
    FLUSH_DONE = 3
    HELD_BIN_AWAY = 4
    FAULT = 5


class FeederCmd(IntEnum):
    NONE = 0
    ENABLE = 1
    DISABLE = 2
    FILL = 3
    QUICK_EMPTY = 4


class FeederState(IntEnum):
    EMPTY = 0
    READY = 1
    PLACING = 2
    EMPTYING = 3
    FAULT = 4


# GearClassifier colour codes in the placement ring buffer.
COLOR_CODES = ("WHITE", "GREEN", "BLUE")


class StationState(IntEnum):
    HOME = 0
    LEAVING = 1
    AWAY = 2
    RETURNING = 3
    FAULT = 4


STATIONS = ("white", "green", "blue", "scrap")

RING_ENTRIES = 16
# {seq, lateral_x_mm, encoder_hi, encoder_lo, color, intact}
RING_WORDS = 6


def _layout(names: list[str], base: int = 0) -> dict[str, int]:
    return {name: base + i for i, name in enumerate(names)}


# ROS -> controller
HOLDING: dict[str, int] = _layout(
    [
        "belt_cmd",  # 0 NONE, 1 RUN_TO_PICKZONE, 2 FLUSH, 3 STOP
        "belt_seq",
        "feeder_cmd",  # 0 NONE, 1 ENABLE, 2 DISABLE, 3 FILL, 4 QUICK_EMPTY
        "feeder_seq",
        "fill_seed",  # SIM only
        *[
            f"station_{s}_{field}" for s in STATIONS for field in ("cmd", "seq")
        ],  # 0 NONE, 1 EXCHANGE
        "cell_cmd",  # 1 FREEZE, 2 RELEASE_FREEZE, 3 FAULT_ACK
        "cell_seq",
    ]
)

# controller -> ROS
INPUT: dict[str, int] = _layout(
    [
        "map_version",
        "belt_state",  # IDLE, RUNNING, STOPPED_AT_EYE, FLUSH_DONE, HELD_BIN_AWAY, FAULT
        "belt_ack_seq",
        "encoder_hi",
        "encoder_lo",
        "exit_count",
        "belt_fault",
        "feeder_state",  # EMPTY, READY, PLACING, EMPTYING, FAULT
        "feeder_ack_seq",
        "remaining",
        "placement_count",
        "feeder_fault",
        *[
            f"station_{s}_{field}"
            for s in STATIONS
            for field in ("state", "ack_seq", "fault")  # HOME, LEAVING, AWAY, RETURNING, FAULT
        ],
        "cell_ack_seq",
        "interlocks",  # bits: bin_home, feeder_ok, drives_ok, estop_chain_ok
    ]
)

# Placement ring buffer follows the scalar block, word-aligned.
RING_BASE = 32

# (holding sequence register, input ack register): the echo rule the controller applies.
ACK_PAIRS: tuple[tuple[str, str], ...] = tuple(
    (name, name.removesuffix("seq") + "ack_seq") for name in HOLDING if name.endswith("_seq")
)

assert max(INPUT.values()) < RING_BASE
assert all(ack in INPUT for _, ack in ACK_PAIRS)
