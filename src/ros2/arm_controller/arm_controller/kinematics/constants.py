"""Canonical UR5e DH parameters, workcell geometry, joint names, and poses."""

import math

from domain import WHITE_TOWER

# Standard UR5e Denavit-Hartenberg Parameters (meters and radians)
UR5E_DH_D: tuple[float, ...] = (0.1625, 0.0, 0.0, 0.1333, 0.0997, 0.0996)
UR5E_DH_A: tuple[float, ...] = (0.0, -0.425, -0.3922, 0.0, 0.0, 0.0)
UR5E_DH_ALPHA: tuple[float, ...] = (
    math.pi / 2.0,
    0.0,
    0.0,
    math.pi / 2.0,
    -math.pi / 2.0,
    0.0,
)


# Workcell Geometry & Physical Tool Parameters
DEFAULT_TCP_OFFSET_M: float = (
    0.108  # DexterousPalm tool center point offset (baseplate + rod + nozzle)
)
MIN_REACH_M: float = 0.20  # Inner reachability limit / base clearance boundary
MAX_REACH_M: float = 0.85  # Outer operational boundary / reach limit
DEFAULT_SPINDLE_TOWER_COORDS: tuple[float, float, float] = (
    WHITE_TOWER[0],
    WHITE_TOWER[1],
    WHITE_TOWER[2],
)
APPROACH_LIFT_OFFSET_M: float = 0.10  # Vertical approach and lift clearance offset
SPINDLE_PIN_HEIGHT_M: float = 0.20  # SpindleTower pin top above the stand
GEARWHEEL_HEIGHT_M: float = 0.02  # a carried Gearwheel hangs this far below the TCP
# D37: the carried Gearwheel crosses the stand above every pin top, with clearance.
TRANSFER_HEIGHT_M: float = SPINDLE_PIN_HEIGHT_M + GEARWHEEL_HEIGHT_M + 0.03
# D37: the Gearwheel is released threaded on the pin tip and slides down to its slot; a tool
# centred on the Gearwheel can't follow it down the pin.
RELEASE_HEIGHT_M: float = SPINDLE_PIN_HEIGHT_M + GEARWHEEL_HEIGHT_M / 2.0

# Canonical UR5e joint names matching ROS2 ros2_control / URDF
CANONICAL_UR5E_JOINTS: list[str] = [
    "shoulder_pan_joint",
    "shoulder_lift_joint",
    "elbow_joint",
    "wrist_1_joint",
    "wrist_2_joint",
    "wrist_3_joint",
]

# UR5e URDF joint position limits (lower, upper) in radians, in CANONICAL_UR5E_JOINTS order.
# Same values as ur_description/urdf/ur5e.urdf; the real controller rejects anything outside.
UR5E_JOINT_LIMITS: tuple[tuple[float, float], ...] = (
    (-2.0 * math.pi, 2.0 * math.pi),  # shoulder_pan_joint
    (-2.0 * math.pi, 2.0 * math.pi),  # shoulder_lift_joint
    (-math.pi, math.pi),  # elbow_joint
    (-2.0 * math.pi, 2.0 * math.pi),  # wrist_1_joint
    (-2.0 * math.pi, 2.0 * math.pi),  # wrist_2_joint
    (-2.0 * math.pi, 2.0 * math.pi),  # wrist_3_joint
)

# Canonical UR5e joint postures
HOME_JOINT_POSITIONS: list[float] = [0.0, -1.5708, 0.0, -1.5708, 0.0, 0.0]
READY_JOINT_POSITIONS: list[float] = [0.0, -0.7854, 1.5708, -0.7854, -1.5708, 0.0]
INSPECT_JOINT_POSITIONS: list[float] = [0.0, -1.0472, 1.3963, -1.9198, -1.5708, 0.0]

# Canonical downward suction cup orientation matrix: tool Z-axis points along -Z_base [0, 0, -1]
DEFAULT_DOWNWARD_ORIENTATION: list[list[float]] = [
    [0.0, 1.0, 0.0],
    [1.0, 0.0, 0.0],
    [0.0, 0.0, -1.0],
]
