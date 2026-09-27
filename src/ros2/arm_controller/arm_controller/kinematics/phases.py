"""Action feedback phases for pick-and-place execution."""

from enum import StrEnum


class ActionPhase(StrEnum):
    """Real-time action feedback phases for pick-and-place execution."""

    APPROACHING = "APPROACHING"
    PICKING = "PICKING"
    GRASPING = "GRASPING"
    LIFTING = "LIFTING"
    TRANSFERRING = "TRANSFERRING"
    DROPPING = "DROPPING"
    RELEASING = "RELEASING"
    RETREATING = "RETREATING"
    HOMING = "HOMING"
    COMPLETED = "COMPLETED"
