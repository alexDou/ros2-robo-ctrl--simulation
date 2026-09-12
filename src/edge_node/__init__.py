"""EdgeNode package."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from domain import (
    DEFAULT_ROBOT_ID,
    CommandType,
    ErrorFrame,
    InferenceMetrics,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    parse_robot_topic,
    robot_command_topic,
    robot_telemetry_topic,
)

from .node import EdgeNode

__all__ = [
    "DEFAULT_ROBOT_ID",
    "EdgeNode",
    "CommandType",
    "ErrorFrame",
    "InferenceMetrics",
    "RobotCommand",
    "RobotState",
    "RobotTelemetryEvent",
    "parse_robot_topic",
    "robot_command_topic",
    "robot_telemetry_topic",
]
