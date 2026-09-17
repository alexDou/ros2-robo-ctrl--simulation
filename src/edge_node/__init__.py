"""EdgeNode package."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from domain import (
    DEFAULT_ROBOT_ID,
    CommandType,
    EmergencyStopPayload,
    ErrorFrame,
    InferenceMetrics,
    PalmAction,
    PalmActuatePayload,
    PalmState,
    PoseName,
    ResetFaultPayload,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    TrajectoryExecutePayload,
    parse_robot_topic,
    robot_command_topic,
    robot_telemetry_topic,
)

from .kinematics import (
    DEFAULT_DOWNWARD_ORIENTATION,
    DEFAULT_SPINDLE_TOWER_COORDS,
    DEFAULT_TCP_OFFSET_M,
    MAX_REACH_M,
    MIN_REACH_M,
    KinematicSingularityError,
    KinematicsError,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
    UR5eKinematics,
    UnreachableTargetError,
    WaypointStep,
    normalize_angle,
)
from .node import EdgeNode
from .workcell import ActiveGear, WorkcellOccupiedError, WorkcellState

__all__ = [
    "DEFAULT_ROBOT_ID",
    "EdgeNode",
    "ActiveGear",
    "WorkcellOccupiedError",
    "WorkcellState",
    "DEFAULT_DOWNWARD_ORIENTATION",
    "DEFAULT_SPINDLE_TOWER_COORDS",
    "DEFAULT_TCP_OFFSET_M",
    "MAX_REACH_M",
    "MIN_REACH_M",
    "KinematicSingularityError",
    "KinematicsError",
    "OutOfReachError",
    "PickAndPlaceTrajectoryGenerator",
    "UR5eKinematics",
    "UnreachableTargetError",
    "WaypointStep",
    "normalize_angle",
    "CommandType",
    "EmergencyStopPayload",
    "ErrorFrame",
    "InferenceMetrics",
    "PalmAction",
    "PalmActuatePayload",
    "PalmState",
    "PoseName",
    "ResetFaultPayload",
    "RobotCommand",
    "RobotState",
    "RobotTelemetryEvent",
    "TrajectoryExecutePayload",
    "parse_robot_topic",
    "robot_command_topic",
    "robot_telemetry_topic",
]
