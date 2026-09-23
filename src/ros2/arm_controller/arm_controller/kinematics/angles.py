"""Angle helpers on S^1 (wrap + shortest-arc unwrap)."""

import math

def normalize_angle(angle: float) -> float:
    """Wraps an angular value in radians into the range [-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def unwrap_joint_angles(q_target: list[float], q_reference: list[float]) -> list[float]:
    """Unwraps target joint angles along shortest arc on S^1 relative to reference configuration."""
    return [
        q_reference[i] + normalize_angle(q_target[i] - q_reference[i])
        for i in range(len(q_target))
    ]
