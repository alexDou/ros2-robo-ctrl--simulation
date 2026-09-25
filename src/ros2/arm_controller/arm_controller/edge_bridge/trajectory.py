"""Trajectory dispatch to FollowJointTrajectory action server."""

import threading
from typing import Any, Optional

from control_msgs.action import FollowJointTrajectory
from trajectory_msgs.msg import JointTrajectoryPoint
from domain import CANONICAL_UR5E_JOINTS, RobotState, RobotTelemetryEvent
from arm_controller.arm_controller_node import seconds_to_duration


class EdgeBridgeTrajectoryMixin:
    def _dispatch_trajectory_points(
        self,
        waypoints: list[list[float]],
        command_id: Optional[str] = None,
        completion_event: Optional[threading.Event] = None,
    ) -> RobotTelemetryEvent:
        """Builds multi-point trajectory with cumulative durations and dispatches to controller."""
        with self._lock:
            q_current = list(self._current_joints)

        goal = FollowJointTrajectory.Goal()
        goal.trajectory.joint_names = list(CANONICAL_UR5E_JOINTS)

        cumulative_time = 0.0
        prev_q = q_current
        for wp in waypoints:
            max_dq = max(abs(wp[i] - prev_q[i]) for i in range(6))
            seg_dur = max(
                self._step_duration,
                max_dq / self._max_joint_velocity if self._max_joint_velocity > 0 else self._step_duration,
            )
            cumulative_time += seg_dur
            prev_q = wp

            pt = JointTrajectoryPoint()
            pt.positions = [float(q) for q in wp]
            pt.velocities = [0.0] * 6
            pt.time_from_start = seconds_to_duration(cumulative_time)
            goal.trajectory.points.append(pt)

        event = self.publish_telemetry(command_id=command_id)

        with self._lock:
            if self._robot_state != RobotState.EXECUTING:
                if completion_event is not None:
                    completion_event.set()
                return event

            send_goal_future = self._traj_client.send_goal_async(goal)

        def on_goal_response(future: Any) -> None:
            try:
                goal_handle = future.result()
            except Exception as err:
                self.get_logger().error(f"Error obtaining goal handle: {err}")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_ERROR", "Trajectory goal failed")
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            if not goal_handle or not goal_handle.accepted:
                self.get_logger().error("Trajectory goal rejected by controller")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_REJECTED", "Trajectory goal was rejected by controller")
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._active_traj_handle = goal_handle
                else:
                    goal_handle.cancel_goal_async()
                    if completion_event is not None:
                        completion_event.set()
                    return

            res_future = goal_handle.get_result_async()

            def on_result(r_future: Any) -> None:
                should_publish_completion = False
                with self._lock:
                    if self._active_traj_handle is not goal_handle:
                        # Stale result (superseded by STANDBY park or ESTOP); ignore.
                        pass
                    else:
                        self._active_traj_handle = None
                        if self._robot_state == RobotState.EXECUTING:
                            try:
                                traj_res = r_future.result()
                                if traj_res.result.error_code == FollowJointTrajectory.Result.SUCCESSFUL:
                                    self._robot_state = RobotState.IDLE
                                    should_publish_completion = True
                                else:
                                    self.get_logger().error(
                                        f"Trajectory failed with code {traj_res.result.error_code}"
                                    )
                                    self._robot_state = RobotState.FAULT
                            except Exception as err:
                                self.get_logger().error(f"Error reading trajectory result: {err}")
                                self._robot_state = RobotState.FAULT

                if completion_event is not None:
                    completion_event.set()

                if should_publish_completion:
                    self.publish_telemetry(command_id=command_id)

            res_future.add_done_callback(on_result)

        send_goal_future.add_done_callback(on_goal_response)
        return event

