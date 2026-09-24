"""Command ingress: payload validation + per-type dispatch."""

from typing import Any, Optional

from geometry_msgs.msg import Point
from domain import (
    ClearWorkspacePayload, CommandType, PickAndPlaceTargetPayload, RobotCommand,
    RobotState, RobotTelemetryEvent, SpawnObjectPayload, TrajectoryExecutePayload,
    CANONICAL_POSES,
)
from robot_control_interfaces.srv import ClearWorkspace, SpawnObject


class EdgeBridgeCommandsMixin:
    def handle_command_payload(self, raw_payload: str | bytes) -> Optional[RobotTelemetryEvent]:
        """Validates JSON schema and dispatches inbound RobotCommand."""
        if isinstance(raw_payload, bytes):
            try:
                raw_payload = raw_payload.decode("utf-8")
            except Exception as e:
                self._publish_error("MALFORMED_PAYLOAD", f"UTF-8 decode failed: {e}")
                return None

        try:
            command = RobotCommand.model_validate_json(raw_payload)
        except Exception as e:
            self._publish_error("SCHEMA_VALIDATION_ERROR", f"Invalid RobotCommand schema: {e}")
            return None

        return self.handle_command(command)

    def handle_command(self, command: RobotCommand) -> Optional[RobotTelemetryEvent]:
        """Processes validated RobotCommand according to operational lifecycle."""
        self.get_logger().info(
            f"Received {command.type.value} command '{command.command_id}' from '{command.sender_id}'"
        )

        if command.type == CommandType.PING:
            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.EMERGENCY_STOP:
            return self.handle_emergency_stop(command_id=command.command_id)

        if command.type == CommandType.RESET_FAULT:
            return self.handle_reset_fault(command_id=command.command_id)

        if command.type == CommandType.ENGAGE:
            return self.handle_engage(command_id=command.command_id)

        if command.type == CommandType.STANDBY:
            return self.handle_standby(command_id=command.command_id)

        with self._lock:
            standby = self._robot_state == RobotState.STANDBY
        if standby:
            self._publish_error(
                "ROBOT_STANDBY",
                "Robot is in STANDBY; send ENGAGE handshake before motion commands",
            )
            return None

        if command.type == CommandType.TRAJECTORY_EXECUTE:
            with self._lock:
                if self._robot_state == RobotState.FAULT:
                    self._publish_error(
                        "ROBOT_IN_FAULT",
                        "Robot is in FAULT state; must RESET_FAULT before commanding trajectories",
                    )
                    return None
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; command rejected",
                    )
                    return None

                # Non-blocking controller check
                if not self._traj_client.server_is_ready():
                    self._publish_error(
                        "CONTROLLER_UNAVAILABLE",
                        "FollowJointTrajectory action server is not available",
                    )
                    return None

                try:
                    payload = TrajectoryExecutePayload.model_validate(command.payload)
                except Exception as e:
                    self._publish_error("INVALID_PAYLOAD", f"TrajectoryExecute payload invalid: {e}")
                    return None

                waypoints_to_execute = []
                if payload.pose_name is not None:
                    if payload.pose_name not in CANONICAL_POSES:
                        self._publish_error(
                            "INVALID_POSE_NAME",
                            f"Unknown pose name '{payload.pose_name}'",
                        )
                        return None
                    waypoints_to_execute = [CANONICAL_POSES[payload.pose_name]]
                elif payload.waypoints is not None and len(payload.waypoints) > 0:
                    waypoints_to_execute = payload.waypoints
                else:
                    self._publish_error(
                        "INVALID_PAYLOAD",
                        "Neither pose_name nor waypoints provided in TRAJECTORY_EXECUTE payload",
                    )
                    return None

                # Atomically transition state under lock to prevent TOCTOU race
                self._robot_state = RobotState.EXECUTING

            return self._dispatch_trajectory_points(
                waypoints_to_execute, command_id=command.command_id
            )

        if command.type == CommandType.SPAWN_OBJECT:
            with self._lock:
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; cannot spawn object",
                    )
                    return None

            try:
                payload = SpawnObjectPayload.model_validate(command.payload)
            except Exception as e:
                self._publish_error("INVALID_PAYLOAD", f"SpawnObject payload invalid: {e}")
                return None

            if not self._spawn_object_client.wait_for_service(timeout_sec=1.0):
                self._publish_error(
                    "SERVICE_UNAVAILABLE",
                    f"SpawnObject service not available at '{self._spawn_object_service_name}'",
                )
                return None

            req = SpawnObject.Request()
            req.coords = Point(x=float(payload.x), y=float(payload.y), z=float(payload.z))
            req.object_type = payload.object_type.value
            req.color = str(getattr(payload, "color", "WHITE") or "WHITE")
            req.defective = bool(getattr(payload, "defective", False))

            with self._lock:
                self._pending_spawn_coords = (float(payload.x), float(payload.y), float(payload.z))
                self._pending_spawn_command_id = command.command_id
            spawn_command_id = command.command_id

            def _on_spawn_done(future: Any) -> None:
                try:
                    res = future.result()
                except Exception as err:
                    self.get_logger().error(f"SpawnObject call failed: {err}")
                    with self._lock:
                        self._pending_spawn_coords = None
                        self._pending_spawn_command_id = None
                    self._publish_error("SERVICE_ERROR", str(err))
                    return
                if res is None or not res.success:
                    msg = res.message if res else "Unknown service failure"
                    with self._lock:
                        self._pending_spawn_coords = None
                        self._pending_spawn_command_id = None
                    self._publish_error("WORKCELL_OCCUPIED", msg)
                    self.publish_telemetry(command_id=spawn_command_id)
                    return
                with self._lock:
                    coords = self._pending_spawn_coords
                    self._pending_spawn_coords = None
                    self._pending_spawn_command_id = None
                    idle = self._robot_state == RobotState.IDLE
                self.publish_telemetry(command_id=spawn_command_id)
                if coords is None or not idle:
                    return
                # Auto-dispatch: click IS dispatch; UI sends one command.
                pnp_payload = PickAndPlaceTargetPayload(
                    pick_x=coords[0], pick_y=coords[1], pick_z=coords[2],
                )
                with self._lock:
                    if self._robot_state != RobotState.IDLE:
                        return
                    self._robot_state = RobotState.EXECUTING
                    self._grasp_notified = False
                    self._commit_notified = False
                self._dispatch_pick_and_place_goal(pnp_payload, command_id=spawn_command_id)

            self._spawn_object_client.call_async(req).add_done_callback(_on_spawn_done)

            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.CLEAR_WORKSPACE:
            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; cannot clear workspace",
                    )
                    return None

            try:
                ClearWorkspacePayload.model_validate(command.payload)
            except Exception as e:
                self._publish_error("INVALID_PAYLOAD", f"ClearWorkspace payload invalid: {e}")
                return None

            if not self._clear_workspace_client.wait_for_service(timeout_sec=1.0):
                self._publish_error(
                    "SERVICE_UNAVAILABLE",
                    f"ClearWorkspace service not available at '{self._clear_workspace_service_name}'",
                )
                return None

            req = ClearWorkspace.Request()
            clear_command_id = command.command_id

            def _on_clear_done(future: Any) -> None:
                try:
                    res = future.result()
                except Exception as err:
                    self.get_logger().error(f"ClearWorkspace call failed: {err}")
                    self._publish_error("SERVICE_ERROR", str(err))
                    return
                if res is None or not res.success:
                    msg = res.message if res else "Unknown service failure"
                    self._publish_error("SERVICE_ERROR", msg)
                    return
                with self._lock:
                    self._is_grasped = False
                self.publish_telemetry(command_id=clear_command_id)

            self._clear_workspace_client.call_async(req).add_done_callback(_on_clear_done)

            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.PICK_AND_PLACE_TARGET:
            with self._lock:
                if self._robot_state == RobotState.FAULT:
                    self._publish_error(
                        "ROBOT_IN_FAULT",
                        "Robot is in FAULT state; must RESET_FAULT before commanding pick and place",
                    )
                    return None
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; command rejected",
                    )
                    return None

                if not self._pnp_client.server_is_ready():
                    self._publish_error(
                        "CONTROLLER_UNAVAILABLE",
                        "PickAndPlace action server is not available",
                    )
                    return None

                try:
                    payload = PickAndPlaceTargetPayload.model_validate(command.payload)
                except Exception as e:
                    self._publish_error("INVALID_PAYLOAD", f"PickAndPlaceTarget payload invalid: {e}")
                    return None

                self._robot_state = RobotState.EXECUTING
                self._grasp_notified = False
                self._commit_notified = False

            return self._dispatch_pick_and_place_goal(
                payload, command_id=command.command_id
            )

        self.get_logger().warning(f"Unsupported command type: {command.type.value}")
        self._publish_error(
            "UNSUPPORTED_COMMAND",
            f"Unsupported command type '{command.type.value}'",
        )
        return None


    def handle_emergency_stop(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Cancels active trajectory and PickAndPlace action immediately and transitions to FAULT state."""
        self.get_logger().warn(f"EMERGENCY STOP TRIGGERED (cmd={command_id})")

        with self._lock:
            self._robot_state = RobotState.FAULT
            active_handle = self._active_traj_handle
            self._active_traj_handle = None
            active_pnp = self._active_pnp_handle
            self._active_pnp_handle = None

        if active_handle is not None:
            try:
                active_handle.cancel_goal_async()
            except Exception as e:
                self.get_logger().warning(f"Failed to cancel active trajectory: {e}")

        if active_pnp is not None:
            try:
                active_pnp.cancel_goal_async()
            except Exception as e:
                self.get_logger().warning(f"Failed to cancel active PickAndPlace: {e}")

        return self.publish_telemetry(command_id=command_id)

    def handle_reset_fault(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Clears FAULT state and returns to IDLE."""
        self.get_logger().info(f"RESET FAULT TRIGGERED (cmd={command_id})")
        with self._lock:
            if self._robot_state == RobotState.FAULT:
                self._robot_state = RobotState.IDLE

        return self.publish_telemetry(command_id=command_id)

