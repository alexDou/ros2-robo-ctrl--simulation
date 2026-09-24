"""Zenoh ingress, joint mapping, telemetry publish, error frames, shutdown."""

import json
import time
from typing import Any, Optional

from sensor_msgs.msg import JointState
from std_msgs.msg import String
from domain import (
    CANONICAL_UR5E_JOINTS, ErrorFrame, InferenceMetrics, PalmState, RobotCommand, RobotState,
    RobotTelemetryEvent, WorkcellState,
)


class EdgeBridgeTelemetryMixin:
    def _init_zenoh(self) -> None:
        """Initializes Zenoh subscriber and publisher on DataFabric topics."""
        if self._zenoh_session is None and self._auto_connect_zenoh:
            try:
                import zenoh

                self._zenoh_session = zenoh.open(zenoh.Config())
                self._owns_zenoh_session = True
                self.get_logger().info("Connected to Eclipse Zenoh session.")
            except Exception as e:
                self.get_logger().warning(
                    f"Failed to open Zenoh session ({e}); running in offline ROS2 mode."
                )
                self._zenoh_session = None

        if self._zenoh_session is not None:
            try:
                self._zenoh_pub = self._zenoh_session.declare_publisher(self._telemetry_topic)
                self._zenoh_feedback_pub = self._zenoh_session.declare_publisher(
                    self._action_feedback_topic
                )
                self._zenoh_sub = self._zenoh_session.declare_subscriber(
                    self._command_topic,
                    self._on_zenoh_command,
                )
                self.get_logger().info(
                    f"EdgeBridge listening on Zenoh '{self._command_topic}', "
                    f"publishing telemetry to '{self._telemetry_topic}', "
                    f"publishing action feedback to '{self._action_feedback_topic}'"
                )
            except Exception as e:
                self.get_logger().error(f"Failed to declare Zenoh entities: {e}")

    def _publish_action_feedback(
        self, command_id: str, phase: str, percent_complete: float
    ) -> None:
        """Publishes structured ActionFeedbackFrame over Zenoh on action_feedback_topic."""
        frame = {
            "type": "ACTION_FEEDBACK",
            "command_id": command_id,
            "phase": phase,
            "percent_complete": float(percent_complete),
            "timestamp_ns": time.time_ns(),
        }
        if self._zenoh_feedback_pub is not None:
            try:
                self._zenoh_feedback_pub.put(json.dumps(frame))
            except Exception as e:
                self.get_logger().error(f"Failed to publish ActionFeedbackFrame to Zenoh: {e}")


    def _on_zenoh_command(self, sample: Any) -> None:
        """Zenoh subscriber callback processing incoming samples from DataFabric."""
        try:
            raw_payload = sample.payload.to_bytes().decode("utf-8")
        except Exception as e:
            self.get_logger().error(f"Failed to decode Zenoh sample: {e}")
            return

        self.handle_command_payload(raw_payload)

    def _on_workcell_state(self, msg: String) -> None:
        """Caches authoritative workcell snapshot; never drives gear transitions."""
        try:
            snapshot = WorkcellState.model_validate_json(msg.data)
        except Exception as e:
            self.get_logger().warning(f"Ignoring malformed workcell/state snapshot: {e}")
            return
        with self._lock:
            self._workcell_state = snapshot

    def _on_telemetry_timer(self) -> Optional[RobotTelemetryEvent]:
        """Steady 10 Hz cached snapshot while engaged; None while STANDBY."""
        with self._lock:
            if self._robot_state == RobotState.STANDBY:
                return None
        return self.publish_telemetry()

    def _handle_joint_states(self, msg: JointState) -> None:
        """Parses /joint_states and maps positions to canonical UR5e joint order."""
        with self._lock:
            if msg.name != self._cached_joint_names:
                try:
                    indices = [msg.name.index(joint) for joint in CANONICAL_UR5E_JOINTS]
                    self._cached_joint_indices = indices
                    self._cached_joint_names = list(msg.name)
                except ValueError:
                    return

            if self._cached_joint_indices is not None:
                positions = msg.position
                if all(idx < len(positions) for idx in self._cached_joint_indices):
                    self._current_joints = [
                        float(positions[idx]) for idx in self._cached_joint_indices
                    ]

    def _publish_error(self, error_code: str, message: str) -> None:
        """Publishes structured ErrorFrame over Zenoh on schema or state validation failures."""
        err = ErrorFrame(
            error_code=error_code,
            message=message,
            timestamp_ns=time.time_ns(),
        )
        self.get_logger().warning(f"ErrorFrame: [{error_code}] {message}")
        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.put(err.model_dump_json())
            except Exception as e:
                self.get_logger().error(f"Failed to publish ErrorFrame to Zenoh: {e}")

    @staticmethod
    def _inference_for_workcell(workcell_state: WorkcellState) -> Optional[InferenceMetrics]:
        """Maps the active gear classification onto the existing inference channel.

        spawned/in_progress gear reports its outcome: DEFECTIVE when
        intact is False, else its color name. Prefers the entry matching
        active_id; falls back to bucket order. No active gear means no
        inference (processed tower never drives the label).
        """
        active = workcell_state.active_id
        buckets = (*workcell_state.spawned, *workcell_state.in_progress)
        entry = next((e for e in buckets if e.id == active), None) if active else None
        if entry is None:
            for bucket in (workcell_state.spawned, workcell_state.in_progress):
                if bucket:
                    entry = bucket[0]
                    break
        if entry is None:
            return None
        label = "DEFECTIVE" if not entry.intact else str(entry.color.value)
        return InferenceMetrics(latency_ms=0.0, confidence=1.0, detected_object=label)

    def publish_telemetry(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Emits RobotTelemetryEvent over Zenoh on robot/{id}/telemetry."""
        with self._lock:
            state = self._robot_state
            joints = list(self._current_joints)
            is_grasped = self._is_grasped
            phase = self._current_phase
            workcell_state = self._workcell_state

        event = RobotTelemetryEvent(
            timestamp_ns=time.time_ns(),
            robot_state=state,
            joint_positions=joints,
            palm_state=PalmState(is_grasped=is_grasped),
            inference_metrics=self._inference_for_workcell(workcell_state),
            workcell_state=workcell_state,
            command_id=command_id,
            phase=phase,
        )

        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.put(event.model_dump_json(exclude_none=True))
            except Exception as e:
                self.get_logger().error(f"Failed to publish telemetry to Zenoh: {e}")

        return event

    def close(self) -> None:
        """Cleans up active goals, Zenoh subscriptions, and ROS2 resources."""
        with self._lock:
            if self._active_traj_handle is not None:
                try:
                    self._active_traj_handle.cancel_goal_async()
                except Exception:
                    pass
                self._active_traj_handle = None

            if self._active_pnp_handle is not None:
                try:
                    self._active_pnp_handle.cancel_goal_async()
                except Exception:
                    pass
                self._active_pnp_handle = None

        if self._startup_thread is not None and self._startup_thread.is_alive():
            self._startup_thread.join(timeout=1.0)

        if self._zenoh_sub is not None:
            try:
                self._zenoh_sub.undeclare()
            except Exception:
                pass
            self._zenoh_sub = None

        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.undeclare()
            except Exception:
                pass
            self._zenoh_pub = None

        if self._zenoh_feedback_pub is not None:
            try:
                self._zenoh_feedback_pub.undeclare()
            except Exception:
                pass
            self._zenoh_feedback_pub = None

        if self._owns_zenoh_session and self._zenoh_session is not None:
            try:
                self._zenoh_session.close()
            except Exception:
                pass
            self._zenoh_session = None

        if self._joint_sub is not None:
            try:
                self.destroy_subscription(self._joint_sub)
            except Exception:
                pass
            self._joint_sub = None

        if self._traj_client is not None:
            try:
                self._traj_client.destroy()
            except Exception:
                pass
            self._traj_client = None

        if self._pnp_client is not None:
            try:
                self._pnp_client.destroy()
            except Exception:
                pass
            self._pnp_client = None

        if self._spawn_object_client is not None:
            try:
                self.destroy_client(self._spawn_object_client)
            except Exception:
                pass
            self._spawn_object_client = None

        if self._clear_workspace_client is not None:
            try:
                self.destroy_client(self._clear_workspace_client)
            except Exception:
                pass
            self._clear_workspace_client = None

        if self._switch_client is not None:
            try:
                self.destroy_client(self._switch_client)
            except Exception:
                pass
            self._switch_client = None

        if self._mark_grasped_client is not None:
            try:
                self.destroy_client(self._mark_grasped_client)
            except Exception:
                pass
            self._mark_grasped_client = None

        if self._commit_drop_client is not None:
            try:
                self.destroy_client(self._commit_drop_client)
            except Exception:
                pass
            self._commit_drop_client = None

        if self._workcell_state_sub is not None:
            try:
                self.destroy_subscription(self._workcell_state_sub)
            except Exception:
                pass
            self._workcell_state_sub = None

        if self._telemetry_timer is not None:
            try:
                self.destroy_timer(self._telemetry_timer)
            except Exception:
                pass
            self._telemetry_timer = None



