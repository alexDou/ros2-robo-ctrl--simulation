"""Angle helpers on S^1 (wrap + shortest-arc unwrap)."""

import math
from collections.abc import Sequence

from arm_controller.kinematics.errors import JointLimitError

_TWO_PI = 2.0 * math.pi


def normalize_angle(angle: float) -> float:
    """Wraps an angular value in radians into the range [-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def unwrap_joint_angles(q_target: list[float], q_reference: list[float]) -> list[float]:
    """Unwraps target joint angles along shortest arc on S^1 relative to reference configuration."""
    return [
        q_reference[i] + normalize_angle(q_target[i] - q_reference[i]) for i in range(len(q_target))
    ]


def unwrap_joint_angles_within_limits(
    q_target: list[float],
    q_reference: list[float],
    limits: Sequence[tuple[float, float]],
) -> list[float]:
    """Picks, per joint, the 2*pi representative of q_target closest to q_reference that lies
    inside its (lower, upper) limit. Plain shortest-arc unwrap accumulates turns over repeated
    cycles and walks joints past their URDF limits; this never does.

    Raises JointLimitError when no representative of a joint fits inside its limits.
    """
    unwrapped: list[float] = []
    for i, (lower, upper) in enumerate(limits):
        nearest = q_reference[i] + normalize_angle(q_target[i] - q_reference[i])
        # Every turn count k with lower <= nearest + k*2pi <= upper (works for any wound reference).
        k_min = math.ceil((lower - nearest) / _TWO_PI)
        k_max = math.floor((upper - nearest) / _TWO_PI)
        candidates = [nearest + k * _TWO_PI for k in range(k_min, k_max + 1)]
        if not candidates:
            raise JointLimitError(
                f"Joint {i} target {q_target[i]:.3f} rad has no representation within "
                f"limits [{lower:.3f}, {upper:.3f}]"
            )
        unwrapped.append(min(candidates, key=lambda q: abs(q - q_reference[i])))
    return unwrapped
