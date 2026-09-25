"""Finite-float guards on wire coordinate payloads (semgrep ros2-float-coord)."""

import math

import pytest
from pydantic import ValidationError

from domain import GearEntry, PickAndPlaceTargetPayload, SpawnObjectPayload, SpawnObjectType

BAD_FLOATS = (math.inf, -math.inf, math.nan)


def test_spawn_object_payload_rejects_non_finite():
    for bad in BAD_FLOATS:
        with pytest.raises(ValidationError):
            SpawnObjectPayload(x=bad, y=0.0, z=0.0, object_type=SpawnObjectType.GEAR)
        with pytest.raises(ValidationError):
            SpawnObjectPayload(x=0.5, y=bad, z=0.0, object_type=SpawnObjectType.GEAR)
        with pytest.raises(ValidationError):
            SpawnObjectPayload(x=0.5, y=0.0, z=bad, object_type=SpawnObjectType.GEAR)


def test_pick_and_place_payload_rejects_non_finite():
    for bad in BAD_FLOATS:
        with pytest.raises(ValidationError):
            PickAndPlaceTargetPayload(pick_x=bad, pick_y=0.0, pick_z=0.0)
        with pytest.raises(ValidationError):
            PickAndPlaceTargetPayload(pick_x=0.5, pick_y=0.0, pick_z=0.0, drop_x=bad)


def test_gear_entry_rejects_non_finite():
    for bad in BAD_FLOATS:
        with pytest.raises(ValidationError):
            GearEntry(id="g0", x=bad, y=0.0, z=0.0, color="WHITE", intact=True)
