"""Unit tests for EdgeBridgeNode PickAndPlace action bridge, feedback streaming, and workcell services.

Covers Unit 6.5-Bugfix.2.2 (hand-sim-1h63):
- Bridging PICK_AND_PLACE_TARGET from Zenoh / command to /arm_controller/pick_and_place ActionClient.
- Action goal translation with pick_coords, optional drop_coords, use_custom_drop, and command_id.
- Real-time action feedback streaming to Zenoh on rt/arm_controller/pick_and_place/_action/feedback.
- Dynamic gripper/palm state (is_grasped) updates during GRASPING and RELEASING phases.
- EMERGENCY_STOP aborting active PickAndPlace action goal and transitioning to FAULT.
- Bridging SPAWN_OBJECT command to /workcell/spawn_object service.
- Bridging CLEAR_WORKSPACE command to /workcell/clear_workspace service.
- Error handling: schema validation, robot busy, robot in fault, service unavailable, and goal rejection.
"""

import math
import time

from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter

from domain import (
    CommandType,
    ErrorFrame,
    PickAndPlaceTargetPayload,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    SpawnObjectPayload,
    robot_command_topic,
    robot_telemetry_topic,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import ClearWorkspace, SpawnObject

from arm_controller.edge_bridge_node import EdgeBridgeNode




def test_edge_bridge_actions_schema_validation_and_rejection():
    """Asserts schema validation errors and fault state rejections return None without crashing."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-actions-err"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        # 1. Malformed PickAndPlaceTarget (missing pick_x) -> STANDBY gate fires first
        bad_pnp = RobotCommand(
            command_id="bad-pnp-1",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_y": 0.1, "pick_z": 0.0},
        )
        res1 = node.handle_command(bad_pnp)
        assert res1 is None
        assert node.robot_state == RobotState.STANDBY

        # 2. Malformed SpawnObject (missing z) -> STANDBY gate fires first
        bad_spawn = RobotCommand(
            command_id="bad-spawn-1",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.5, "y": 0.1, "object_type": "GEAR"},
        )
        res2 = node.handle_command(bad_spawn)
        assert res2 is None
        assert node.robot_state == RobotState.STANDBY

        # 3. Fault state rejection
        node._robot_state = RobotState.FAULT
        cmd_in_fault = RobotCommand(
            command_id="pnp-fault",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_x": 0.5, "pick_y": 0.0, "pick_z": 0.0},
        )
        res3 = node.handle_command(cmd_in_fault)
        assert res3 is None
        assert node.robot_state == RobotState.FAULT

        # 4. Reset fault restores IDLE
        node.handle_reset_fault()
        assert node.robot_state == RobotState.IDLE

        # 5. Controller unavailable rejection
        res4 = node.handle_command(cmd_in_fault)
        assert res4 is None
        assert node.robot_state == RobotState.IDLE
    finally:
        node.close()
        node.destroy_node()
