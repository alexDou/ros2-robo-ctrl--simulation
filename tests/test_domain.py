import pytest
from pydantic import ValidationError

from domain import (
    CANONICAL_UR5E_JOINTS,
    UR5E_JOINTS,
    ArmJointPositions,
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


def test_robot_command_ping_serialization_round_trip():
    cmd = RobotCommand(
        command_id="a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
        sender_id="ui-client",
        timestamp_ns=1_725_894_942_000_000_000,
        type=CommandType.PING,
        payload={},
    )
    json_data = cmd.model_dump_json()
    restored = RobotCommand.model_validate_json(json_data)
    assert restored == cmd
    assert restored.type == CommandType.PING
    assert restored.type.value == "PING"


def test_robot_command_malformed_fails_validation():
    with pytest.raises(ValidationError):
        RobotCommand.model_validate_json(
            '{"command_id": "123", "sender_id": "ui", "timestamp_ns": 1, "type": "INVALID_CMD", "payload": {}}'
        )

    with pytest.raises(ValidationError):
        RobotCommand.model_validate_json(
            '{"sender_id": "ui", "timestamp_ns": 1, "type": "PING", "payload": {}}'
        )


def test_robot_telemetry_event_serialization_round_trip():
    event = RobotTelemetryEvent(
        timestamp_ns=1_725_894_942_000_000_000,
        robot_state=RobotState.IDLE,
        joint_positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        inference_metrics=InferenceMetrics(
            latency_ms=15.5,
            confidence=0.98,
            detected_object="box",
        ),
        command_id="a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
    )
    json_data = event.model_dump_json()
    restored = RobotTelemetryEvent.model_validate_json(json_data)
    assert restored == event
    assert restored.robot_state == RobotState.IDLE
    assert len(restored.joint_positions) == 6


def test_canonical_joint_constants():
    assert UR5E_JOINTS == [
        "shoulder_pan_joint",
        "shoulder_lift_joint",
        "elbow_joint",
        "wrist_1_joint",
        "wrist_2_joint",
        "wrist_3_joint",
    ]
    assert CANONICAL_UR5E_JOINTS == UR5E_JOINTS
    assert len(UR5E_JOINTS) == 6


def test_robot_telemetry_event_malformed_fails():
    # Only 2 joint positions instead of 6
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": 1, "robot_state": "IDLE", "joint_positions": [0.0, 1.0]}'
        )

    # 5 joint positions instead of 6
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": 1, "robot_state": "IDLE", "joint_positions": [0.0, 1.0, 2.0, 3.0, 4.0]}'
        )

    # 7 joint positions instead of 6
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": 1, "robot_state": "IDLE", "joint_positions": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]}'
        )

    # Non-finite values: NaN
    with pytest.raises(ValidationError):
        RobotTelemetryEvent(
            timestamp_ns=1,
            robot_state=RobotState.IDLE,
            joint_positions=[float("nan"), 0.0, 0.0, 0.0, 0.0, 0.0],
        )

    # Non-finite values: Infinity
    with pytest.raises(ValidationError):
        RobotTelemetryEvent(
            timestamp_ns=1,
            robot_state=RobotState.IDLE,
            joint_positions=[float("inf"), 0.0, 0.0, 0.0, 0.0, 0.0],
        )

    # Non-finite values: -Infinity
    with pytest.raises(ValidationError):
        RobotTelemetryEvent(
            timestamp_ns=1,
            robot_state=RobotState.IDLE,
            joint_positions=[float("-inf"), 0.0, 0.0, 0.0, 0.0, 0.0],
        )

    # Invalid robot_state
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": 1, "robot_state": "SLEEPING", "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}'
        )

    # Negative timestamp
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": -5, "robot_state": "IDLE", "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}'
        )


def test_error_frame_serialization_round_trip():
    err = ErrorFrame(
        error_code="SCHEMA_VIOLATION",
        message="Missing command_id",
        timestamp_ns=1_725_894_942_000,
    )
    json_data = err.model_dump_json()
    restored = ErrorFrame.model_validate_json(json_data)
    assert restored == err
    assert restored.type == "ERROR"


def test_datafabric_key_expressions():
    assert robot_command_topic("robot-0") == "robot/robot-0/command"
    assert robot_telemetry_topic("robot-0") == "robot/robot-0/telemetry"

    assert parse_robot_topic("robot/robot-0/command") == ("robot-0", "command")
    assert parse_robot_topic("robot/robot-0/telemetry") == ("robot-0", "telemetry")
    assert parse_robot_topic("invalid/topic") is None
    assert parse_robot_topic("robot//command") is None

    with pytest.raises(ValueError):
        robot_command_topic("")

    with pytest.raises(ValueError):
        robot_command_topic("bad/id")


def test_canonical_json_schemas():
    import json
    from pathlib import Path

    schema_dir = Path(__file__).parent.parent / "schemas"
    schemas = [
        "robot_command.schema.json",
        "robot_telemetry_event.schema.json",
        "error_frame.schema.json",
    ]

    for name in schemas:
        schema_path = schema_dir / name
        assert schema_path.exists(), f"Missing schema file: {name}"
        data = json.loads(schema_path.read_text())
        assert "$schema" in data
        assert "title" in data
        assert "properties" in data
        assert "required" in data

    telem_data = json.loads((schema_dir / "robot_telemetry_event.schema.json").read_text())
    assert telem_data["$defs"]["canonical_joints"]["enum"] == UR5E_JOINTS
    assert telem_data["properties"]["joint_positions"]["minItems"] == 6
    assert telem_data["properties"]["joint_positions"]["maxItems"] == 6
    assert telem_data["properties"]["timestamp_ns"]["minimum"] == 0
    assert "palm_state" in telem_data["required"]
    assert "palm_state" in telem_data["properties"]
    assert telem_data["properties"]["palm_state"]["properties"]["is_grasped"]["type"] == "boolean"

    cmd_data = json.loads((schema_dir / "robot_command.schema.json").read_text())
    assert "PALM_ACTUATE" in cmd_data["properties"]["type"]["enum"]
    assert "TRAJECTORY_EXECUTE" in cmd_data["properties"]["type"]["enum"]
    assert "EMERGENCY_STOP" in cmd_data["properties"]["type"]["enum"]
    assert "RESET_FAULT" in cmd_data["properties"]["type"]["enum"]
    assert "palm_actuate_payload" in cmd_data["$defs"]
    assert "trajectory_execute_payload" in cmd_data["$defs"]
    assert "emergency_stop_payload" in cmd_data["$defs"]
    assert "reset_fault_payload" in cmd_data["$defs"]


def test_palm_actuate_payload_serialization():
    payload_grasp = PalmActuatePayload(action=PalmAction.GRASP)
    assert payload_grasp.action == PalmAction.GRASP
    assert payload_grasp.model_dump() == {"action": "GRASP"}

    restored = PalmActuatePayload.model_validate_json('{"action": "RELEASE"}')
    assert restored.action == PalmAction.RELEASE

    cmd = RobotCommand(
        command_id="a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
        sender_id="ui-client",
        timestamp_ns=1_725_894_942_000_000_000,
        type=CommandType.PALM_ACTUATE,
        payload=payload_grasp.model_dump(),
    )
    restored_cmd = RobotCommand.model_validate_json(cmd.model_dump_json())
    assert restored_cmd.type == CommandType.PALM_ACTUATE
    assert restored_cmd.payload["action"] == "GRASP"

    with pytest.raises(ValidationError):
        PalmActuatePayload.model_validate_json('{"action": "INVALID_ACTION"}')

    with pytest.raises(ValidationError):
        PalmActuatePayload.model_validate_json('{}')


def test_trajectory_execute_payload_serialization():
    payload_canned = TrajectoryExecutePayload(pose_name=PoseName.HOME)
    assert payload_canned.pose_name == PoseName.HOME
    assert payload_canned.waypoints is None
    assert payload_canned.model_dump(exclude_none=True) == {"pose_name": "HOME"}

    ready_payload = TrajectoryExecutePayload.model_validate_json('{"pose_name": "READY"}')
    assert ready_payload.pose_name == PoseName.READY

    inspect_payload = TrajectoryExecutePayload.model_validate_json('{"pose_name": "INSPECT_POSE"}')
    assert inspect_payload.pose_name == PoseName.INSPECT_POSE

    waypoints = [
        [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        [0.1, -1.50, 1.60, 0.0, 0.0, 0.0],
    ]
    payload_waypoints = TrajectoryExecutePayload(waypoints=waypoints)
    assert payload_waypoints.waypoints == waypoints

    restored = TrajectoryExecutePayload.model_validate_json(payload_waypoints.model_dump_json())
    assert restored.waypoints == waypoints

    with pytest.raises(ValidationError):
        TrajectoryExecutePayload.model_validate_json('{"pose_name": "DANCE"}')

    # Waypoint with 5 elements instead of 6
    with pytest.raises(ValidationError):
        TrajectoryExecutePayload(waypoints=[[0.0, 0.0, 0.0, 0.0, 0.0]])


def test_emergency_stop_and_reset_fault_payload_serialization():
    estop_with_reason = EmergencyStopPayload(reason="Obstacle detected")
    assert estop_with_reason.reason == "Obstacle detected"
    restored_estop = EmergencyStopPayload.model_validate_json(estop_with_reason.model_dump_json())
    assert restored_estop.reason == "Obstacle detected"

    estop_empty = EmergencyStopPayload()
    assert estop_empty.reason is None
    assert EmergencyStopPayload.model_validate_json("{}").reason is None

    reset_payload = ResetFaultPayload()
    assert ResetFaultPayload.model_validate_json("{}") == reset_payload

    with pytest.raises(ValidationError):
        ResetFaultPayload.model_validate_json('{"unexpected": "field"}')


def test_robot_telemetry_event_palm_state():
    event_grasped = RobotTelemetryEvent(
        timestamp_ns=1_725_894_942_000_000_000,
        robot_state=RobotState.IDLE,
        joint_positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state=PalmState(is_grasped=True),
    )
    assert event_grasped.palm_state.is_grasped is True
    json_data = event_grasped.model_dump_json()
    assert '"palm_state":{"is_grasped":true}' in json_data or '"palm_state": {"is_grasped": true}' in json_data

    restored = RobotTelemetryEvent.model_validate_json(json_data)
    assert restored.palm_state.is_grasped is True

    # Safe default: when omitted or defaulted, is_grasped is False
    event_default = RobotTelemetryEvent(
        timestamp_ns=1_725_894_942_000_000_000,
        robot_state=RobotState.IDLE,
        joint_positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
    )
    assert event_default.palm_state.is_grasped is False

    # Deserializing without palm_state uses safe default
    raw_no_palm = '{"timestamp_ns": 1, "robot_state": "IDLE", "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}'
    restored_default = RobotTelemetryEvent.model_validate_json(raw_no_palm)
    assert restored_default.palm_state.is_grasped is False

    # Invalid palm_state type
    with pytest.raises(ValidationError):
        RobotTelemetryEvent.model_validate_json(
            '{"timestamp_ns": 1, "robot_state": "IDLE", "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "palm_state": {"is_grasped": "not_a_bool"}}'
        )


