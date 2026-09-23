"""Pick-and-place action dispatch + workcell service callbacks."""

import threading
from typing import Any, Optional

from geometry_msgs.msg import Point
from domain import PickAndPlaceTargetPayload, RobotState, RobotTelemetryEvent
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import CommitDrop, MarkGrasped


class EdgeBridgeActionsMixin:
    def _call_mark_grasped_async(self) -> None:
        """Fires MarkGrasped once; failure -> ErrorFrame + cancel active goal, no retry."""
        if not self._mark_grasped_client.wait_for_service(timeout_sec=1.0):
            self._publish_error(
                "SERVICE_UNAVAILABLE",
                f"MarkGrasped service not available at '{self._mark_grasped_service_name}'",
            )
            self._cancel_active_pnp("MarkGrasped unavailable")
            return

        def _on_done(future: Any) -> None:
            try:
                res = future.result()
            except Exception as err:
                self._publish_error("SERVICE_ERROR", f"MarkGrasped failed: {err}")
                self._cancel_active_pnp("MarkGrasped failed")
                return
            if res is None or not res.success:
                msg = res.message if res else "Unknown service failure"
                self._publish_error("GRASP_FAILED", msg)
                self._cancel_active_pnp("MarkGrasped rejected")

        self._mark_grasped_client.call_async(MarkGrasped.Request()).add_done_callback(_on_done)

    def _call_commit_drop_async(self) -> None:
        """Fires CommitDrop once; failure -> ErrorFrame + cancel active goal, no retry."""
        if not self._commit_drop_client.wait_for_service(timeout_sec=1.0):
            self._publish_error(
                "SERVICE_UNAVAILABLE",
                f"CommitDrop service not available at '{self._commit_drop_service_name}'",
            )
            self._cancel_active_pnp("CommitDrop unavailable")
            return

        def _on_done(future: Any) -> None:
            try:
                res = future.result()
            except Exception as err:
                self._publish_error("SERVICE_ERROR", f"CommitDrop failed: {err}")
                self._cancel_active_pnp("CommitDrop failed")
                return
            if res is None or not res.success:
                msg = res.message if res else "Unknown service failure"
                self._publish_error("COMMIT_FAILED", msg)
                self._cancel_active_pnp("CommitDrop rejected")

        self._commit_drop_client.call_async(CommitDrop.Request()).add_done_callback(_on_done)

    def _cancel_active_pnp(self, reason: str) -> None:
        with self._lock:
            handle = self._active_pnp_handle
        if handle is not None:
            try:
                handle.cancel_goal_async()
            except Exception as err:
                self.get_logger().error(f"Failed to cancel PnP goal ({reason}): {err}")

    def _dispatch_pick_and_place_goal(
        self,
        payload: PickAndPlaceTargetPayload,
        command_id: Optional[str] = None,
        completion_event: Optional[threading.Event] = None,
    ) -> RobotTelemetryEvent:
        """Builds PickAndPlace goal and dispatches to action server, streaming feedback to Zenoh."""
        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(
            x=float(payload.pick_x),
            y=float(payload.pick_y),
            z=float(payload.pick_z),
        )
        if (
            payload.drop_x is not None
            and payload.drop_y is not None
            and payload.drop_z is not None
        ):
            goal.drop_coords = Point(
                x=float(payload.drop_x),
                y=float(payload.drop_y),
                z=float(payload.drop_z),
            )
            goal.use_custom_drop = True
        else:
            goal.drop_coords = Point(x=0.0, y=0.0, z=0.0)
            goal.use_custom_drop = False
        goal.command_id = command_id or ""

        def on_feedback(feedback_msg: Any) -> None:
            fb = feedback_msg.feedback
            phase = fb.phase
            pct = float(fb.percent_complete)
            state_changed = False
            fire_grasp = False
            fire_commit = False

            with self._lock:
                if phase == "GRASPING":
                    if not self._is_grasped:
                        self._is_grasped = True
                        state_changed = True
                    if not self._grasp_notified:
                        self._grasp_notified = True
                        fire_grasp = True
                elif phase == "RELEASING":
                    if self._is_grasped:
                        self._is_grasped = False
                        state_changed = True
                    if not self._commit_notified:
                        self._commit_notified = True
                        fire_commit = True
                if self._current_phase != phase:
                    self._current_phase = phase
                    state_changed = True

            if fire_grasp:
                self._call_mark_grasped_async()
            if fire_commit:
                self._call_commit_drop_async()

            self._publish_action_feedback(goal.command_id, phase, pct)
            if state_changed:
                self.publish_telemetry(command_id=command_id)

        event = self.publish_telemetry(command_id=command_id)

        with self._lock:
            if self._robot_state != RobotState.EXECUTING:
                if completion_event is not None:
                    completion_event.set()
                return event

            send_goal_future = self._pnp_client.send_goal_async(
                goal, feedback_callback=on_feedback
            )

        def on_goal_response(future: Any) -> None:
            try:
                goal_handle = future.result()
            except Exception as err:
                self.get_logger().error(f"Error obtaining PickAndPlace goal handle: {err}")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_ERROR", str(err))
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            if not goal_handle or not goal_handle.accepted:
                self.get_logger().error("PickAndPlace goal rejected by server")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_REJECTED", "PickAndPlace goal was rejected by action server")
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._active_pnp_handle = goal_handle
                else:
                    goal_handle.cancel_goal_async()
                    if completion_event is not None:
                        completion_event.set()
                    return

            res_future = goal_handle.get_result_async()

            def on_result(r_future: Any) -> None:
                should_publish_completion = False
                with self._lock:
                    if self._active_pnp_handle is not goal_handle:
                        # Stale result (superseded by STANDBY teardown or ESTOP); ignore.
                        pass
                    else:
                        self._active_pnp_handle = None
                        if self._robot_state == RobotState.EXECUTING:
                            try:
                                pnp_res = r_future.result()
                                if pnp_res.result.success:
                                    self._robot_state = RobotState.IDLE
                                    self._is_grasped = False
                                    self._current_phase = None
                                    should_publish_completion = True
                                else:
                                    self.get_logger().error(
                                        f"PickAndPlace failed: {pnp_res.result.message}"
                                    )
                                    self._robot_state = RobotState.FAULT
                                    self._publish_error("ACTION_FAILED", pnp_res.result.message)
                                    should_publish_completion = True
                            except Exception as err:
                                self.get_logger().error(f"Error reading PickAndPlace result: {err}")
                                self._robot_state = RobotState.FAULT
                                self._publish_error("RESULT_ERROR", str(err))
                                should_publish_completion = True

                if completion_event is not None:
                    completion_event.set()

                if should_publish_completion:
                    self.publish_telemetry(command_id=command_id)

            res_future.add_done_callback(on_result)

        send_goal_future.add_done_callback(on_goal_response)
        return event

