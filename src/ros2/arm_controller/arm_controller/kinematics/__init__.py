"""UR5e kinematics subpackage; `__init__` re-exports the public surface."""

from arm_controller.kinematics.angles import (
    normalize_angle,
    unwrap_joint_angles,
    unwrap_joint_angles_within_limits,
)
from arm_controller.kinematics.constants import (
    APPROACH_LIFT_OFFSET_M,
    CANONICAL_UR5E_JOINTS,
    DEFAULT_DOWNWARD_ORIENTATION,
    DEFAULT_SPINDLE_TOWER_COORDS,
    DEFAULT_TCP_OFFSET_M,
    GEARWHEEL_HEIGHT_M,
    HOME_JOINT_POSITIONS,
    INSPECT_JOINT_POSITIONS,
    MAX_REACH_M,
    MIN_REACH_M,
    READY_JOINT_POSITIONS,
    RELEASE_HEIGHT_M,
    SPINDLE_PIN_HEIGHT_M,
    TRANSFER_HEIGHT_M,
    UR5E_DH_A,
    UR5E_DH_ALPHA,
    UR5E_DH_D,
    UR5E_JOINT_LIMITS,
)
from arm_controller.kinematics.errors import (
    JointLimitError,
    KinematicsError,
    KinematicSingularityError,
    OutOfReachError,
    UnreachableTargetError,
)
from arm_controller.kinematics.phases import ActionPhase
from arm_controller.kinematics.solver import AnalyticalInverseKinematics, UR5eKinematics
from arm_controller.kinematics.trajectory import (
    PickAndPlaceTrajectoryGenerator,
    WaypointStep,
)

__all__ = [
    "APPROACH_LIFT_OFFSET_M",
    "ActionPhase",
    "AnalyticalInverseKinematics",
    "JointLimitError",
    "KinematicSingularityError",
    "KinematicsError",
    "OutOfReachError",
    "PickAndPlaceTrajectoryGenerator",
    "UnreachableTargetError",
    "UR5eKinematics",
    "WaypointStep",
    "normalize_angle",
    "CANONICAL_UR5E_JOINTS",
    "DEFAULT_DOWNWARD_ORIENTATION",
    "DEFAULT_SPINDLE_TOWER_COORDS",
    "DEFAULT_TCP_OFFSET_M",
    "GEARWHEEL_HEIGHT_M",
    "HOME_JOINT_POSITIONS",
    "INSPECT_JOINT_POSITIONS",
    "MAX_REACH_M",
    "MIN_REACH_M",
    "READY_JOINT_POSITIONS",
    "RELEASE_HEIGHT_M",
    "SPINDLE_PIN_HEIGHT_M",
    "TRANSFER_HEIGHT_M",
    "UR5E_DH_A",
    "UR5E_DH_ALPHA",
    "UR5E_DH_D",
    "UR5E_JOINT_LIMITS",
    "unwrap_joint_angles",
    "unwrap_joint_angles_within_limits",
]
