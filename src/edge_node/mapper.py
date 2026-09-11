"""JointState extraction and mapping for canonical 6-DoF UR5e arm."""

import math
import threading
from typing import Any
from domain import CANONICAL_UR5E_JOINTS


class JointStateMapper:
    """Extracts canonical 6-DoF UR5e joint angles from ROS2 JointState messages.

    Applies zero-order hold on missing joints, safely ignores extraneous
    joints (such as grippers), and rejects non-finite values (NaN/Inf).
    Guarantees thread-safe atomic updates and reads.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._positions: dict[str, float] = {name: 0.0 for name in CANONICAL_UR5E_JOINTS}

    def get_positions(self) -> list[float]:
        """Returns the canonical 6-DoF joint positions in radians."""
        with self._lock:
            return [self._positions[name] for name in CANONICAL_UR5E_JOINTS]

    def update_from_joint_state(self, msg: Any) -> list[float]:
        """Updates internal joint state from a sensor_msgs/msg/JointState or compatible message.

        Args:
            msg: Inbound message. Accepted types:
                - sensor_msgs.msg.JointState (ROS2 message with .name and .position)
                - dict[str, Any] (mapping containing 'name' and 'position' sequences)
                - Any duck-typed object exposing .name and .position

        Returns:
            list[float]: Current canonical 6-DoF UR5e joint positions in radians.
        """
        if hasattr(msg, "name") and hasattr(msg, "position"):
            names = msg.name or []
            positions = msg.position or []
        elif isinstance(msg, dict):
            names = msg.get("name") or []
            positions = msg.get("position") or []
        else:
            return self.get_positions()

        count = min(len(names), len(positions))
        with self._lock:
            for i in range(count):
                name = names[i]
                if name in self._positions:
                    pos = positions[i]
                    try:
                        pos_float = float(pos)
                        if math.isfinite(pos_float):
                            self._positions[name] = pos_float
                    except (ValueError, TypeError):
                        continue

            return [self._positions[name] for name in CANONICAL_UR5E_JOINTS]
