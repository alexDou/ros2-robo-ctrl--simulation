"""ENGAGE/STANDBY handshake, homing, controller switching."""

import threading
import time
from typing import Optional

from controller_manager_msgs.srv import SwitchController
from sensor_msgs.msg import JointState
from rclpy.qos import qos_profile_sensor_data

from domain import CANONICAL_POSES, PoseName, RobotState, RobotTelemetryEvent


class EdgeBridgeLifecycleMixin:
    def _run_startup_homing(self) -> None:
        """Runs startup homing to CANONICAL_POSES[HOME] in a background worker."""
        self.get_logger().info(
            f"Waiting up to {self._traj_connect_timeout}s for trajectory controller action server..."
        )
        server_ready = self._traj_client.wait_for_server(timeout_sec=self._traj_connect_timeout)

        if not server_ready:
            self.get_logger().warning(
                "Trajectory controller action server not available for startup homing; setting IDLE"
            )
            with self._lock:
                if self._robot_state == RobotState.BOOTING:
                    self._robot_state = RobotState.IDLE
            self._homing_done_event.set()
            self.publish_telemetry()
            return

        self.get_logger().info("Executing startup auto-homing to CANONICAL_POSES[HOME]...")
        home_target = CANONICAL_POSES[PoseName.HOME]

        with self._lock:
            if self._robot_state != RobotState.BOOTING:
                self._homing_done_event.set()
                return
            self._robot_state = RobotState.EXECUTING

        self._startup_motion_event.clear()
        self._dispatch_trajectory_points(
            [home_target],
            command_id="startup-homing",
            completion_event=self._startup_motion_event,
        )

        # Wait on completion event signaled by action result
        wait_timeout = max(10.0, self._step_duration * 5.0)
        self._startup_motion_event.wait(timeout=wait_timeout)

        with self._lock:
            if self._robot_state == RobotState.BOOTING or self._robot_state == RobotState.EXECUTING:
                self._robot_state = RobotState.IDLE

        self._homing_done_event.set()
        self.publish_telemetry(command_id="startup-homing")
        self.get_logger().info("Startup auto-homing complete; EdgeBridge state is IDLE.")

    def wait_for_homing(self, timeout_sec: float = 5.0) -> bool:
        """Blocks until startup homing has finished."""
        return self._homing_done_event.wait(timeout=timeout_sec)

    def _switch_controllers(
        self, activate: list[str], deactivate: list[str]
    ) -> bool:
        """Activates/deactivates controllers via switch_controller (BEST_EFFORT).

        Controllers spawn --inactive (parked: no /joint_states traffic).
        ENGAGE activates both; STANDBY deactivates both. Returns False
        (warning logged) when service missing — motion then fails loudly
        at action-server wait instead of silently.
        """
        if not self._switch_client.wait_for_service(timeout_sec=self._switch_timeout):
            self.get_logger().warning(
                f"switch_controller unavailable after {self._switch_timeout}s; "
                "controllers stay parked"
            )
            return False
        req = SwitchController.Request()
        req.activate_controllers = activate
        req.deactivate_controllers = deactivate
        req.strictness = SwitchController.Request.BEST_EFFORT
        req.activate_asap = True
        req.timeout.sec = int(self._switch_timeout)
        future = self._switch_client.call_async(req)
        # Executor-safe wait: MultiThreadedExecutor already spins this node,
        # so poll future.done() instead of nested spin_until_future_complete
        # (which would raise "node already added to executor" from Zenoh thread).
        deadline = time.monotonic() + self._switch_timeout + 2.0
        while not future.done() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not future.done():
            self.get_logger().warning("switch_controller call timed out")
            return False
        if not future.result().ok:
            self.get_logger().warning(
                f"switch_controller rejected: {future.result().message}"
            )
            return False
        return True

    def handle_engage(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """ENGAGE handshake: activate controllers, subscribe joints, home, go IDLE.

        Strict order: (1) switch controllers active, (2) subscribe joints
        lazily, (3) home via existing homing path. A rejected/unavailable
        switch aborts parked: no joint subscription, no homing thread,
        state back to STANDBY plus a standby error frame.
        """
        with self._lock:
            if self._robot_state == RobotState.IDLE:
                return self.publish_telemetry(command_id=command_id)
            if self._robot_state not in (RobotState.STANDBY, RobotState.BOOTING):
                self._publish_error(
                    "ROBOT_BUSY",
                    f"Robot is currently {self._robot_state.value}; ENGAGE rejected",
                )
                return self.publish_telemetry(command_id=command_id)
            self._robot_state = RobotState.BOOTING
            self._homing_done_event.clear()
            self._startup_motion_event.clear()
            need_sub = self._joint_sub is None
            need_homing_thread = (
                self._startup_thread is None or not self._startup_thread.is_alive()
            )

        self.get_logger().info("ENGAGE step 1/3: activating controllers...")
        switched = self._switch_controllers(
            activate=["joint_state_broadcaster", "scaled_joint_trajectory_controller"],
            deactivate=[],
        )
        if not switched:
            self.get_logger().warning(
                "ENGAGE step 1/3 failed: switch_controller rejected/unavailable; "
                "staying parked in STANDBY"
            )
            with self._lock:
                self._robot_state = RobotState.STANDBY
            self._homing_done_event.set()
            self._publish_error(
                "SWITCH_CONTROLLER_FAILED",
                "switch_controller activation failed; arm stays parked in STANDBY",
            )
            return self.publish_telemetry(command_id=command_id)
        self.get_logger().info("ENGAGE step 1/3 done: controllers active")

        if need_sub:
            self.get_logger().info("ENGAGE step 2/3: subscribing to joint states...")
            self._joint_sub = self.create_subscription(
                JointState,
                self._joint_states_topic,
                self._handle_joint_states,
                qos_profile_sensor_data,
                callback_group=self._telem_cb_group,
            )
            self.get_logger().info("ENGAGE step 2/3 done: joint subscription active")
        else:
            self.get_logger().info(
                "ENGAGE step 2/3 skipped: sub already active"
            )

        if need_homing_thread:
            if self._auto_home_on_startup:
                self.get_logger().info("ENGAGE step 3/3: starting homing thread...")
                self._startup_thread = threading.Thread(
                    target=self._run_startup_homing,
                    name="edge_bridge_homing",
                    daemon=True,
                )
                self._startup_thread.start()
            else:
                self.get_logger().info(
                    "ENGAGE step 3/3 skipped: homing off, going IDLE"
                )
                with self._lock:
                    self._robot_state = RobotState.IDLE
                self._homing_done_event.set()
                return self.publish_telemetry(command_id=command_id)
        else:
            self.get_logger().info(
                "ENGAGE step 3/3 skipped: homing already in progress"
            )

        return self.publish_telemetry(command_id=command_id)

    def handle_standby(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """STANDBY handshake: cancel goals, park home if mid-motion, drop sub, park in STANDBY.

        Order: (1) cancel active trajectory + PickAndPlace goals, (2) send one
        home park goal when the previous state was EXECUTING (skipped while
        ready), bounded by standby_park_timeout, (3) drop the joint
        subscription, (4) deactivate controllers. Park/deactivate failures are
        warnings; state always ends STANDBY.
        """
        with self._lock:
            prev_state = self._robot_state
            active_handle = self._active_traj_handle
            self._active_traj_handle = None
            active_pnp = self._active_pnp_handle
            self._active_pnp_handle = None

        for handle, label in ((active_handle, "trajectory"), (active_pnp, "PickAndPlace")):
            if handle is not None:
                try:
                    handle.cancel_goal_async()
                except Exception as e:
                    self.get_logger().warning(f"Failed to cancel active {label}: {e}")

        if prev_state == RobotState.EXECUTING:
            self.get_logger().info("STANDBY: parking to HOME before deactivation...")
            # Park runs while still EXECUTING so the dispatch gate passes and
            # the park result callback is not treated as stale.
            park_done = threading.Event()
            try:
                self._dispatch_trajectory_points(
                    [list(CANONICAL_POSES[PoseName.HOME])],
                    command_id=command_id,
                    completion_event=park_done,
                )
            except Exception as e:
                self.get_logger().warning(f"STANDBY park dispatch failed: {e}; staying parked")
                park_done.set()
            else:
                if not park_done.wait(timeout=self._standby_park_timeout):
                    self.get_logger().warning(
                        f"STANDBY park timed out after {self._standby_park_timeout}s; staying parked"
                    )
                    with self._lock:
                        stray = self._active_traj_handle
                        self._active_traj_handle = None
                    if stray is not None:
                        try:
                            stray.cancel_goal_async()
                        except Exception as e:
                            self.get_logger().warning(f"Failed to cancel stray park goal: {e}")
                else:
                    self.get_logger().info("STANDBY: park to HOME complete")
        else:
            self.get_logger().info(
                f"STANDBY: skipping park (state was {prev_state.value}); deactivating..."
            )

        with self._lock:
            # Park completion may have flipped EXECUTING->IDLE; force STANDBY last
            # so the final state is always parked regardless of callback timing.
            self._robot_state = RobotState.STANDBY
            self._active_traj_handle = None
            self._active_pnp_handle = None
            joint_sub = self._joint_sub
            self._joint_sub = None

        if joint_sub is not None:
            try:
                self.destroy_subscription(joint_sub)
            except Exception:
                pass

        if not self._switch_controllers(
            activate=[],
            deactivate=["scaled_joint_trajectory_controller", "joint_state_broadcaster"],
        ):
            self.get_logger().warning("STANDBY: controller deactivation failed; staying parked")

        return self.publish_telemetry(command_id=command_id)


