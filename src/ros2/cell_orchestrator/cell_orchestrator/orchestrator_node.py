"""CellOrchestratorNode: owns ConveyorStatus and drives the conveyor device.

Tracer slice: Fill loads the FlexFeeder (EMPTY -> LOADED), Process enables the feeder and runs
the belt to the PickZone eye, Stop freezes both. SortCycles, exchanges and the flush reset land
in later Unit 9 tickets.
"""

import json
import threading
from typing import Any

import rclpy
from rclpy.action import ActionClient
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import ExternalShutdownException, MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.action import ConveyorRun
from robot_control_interfaces.srv import (
    CellFill,
    CellProcess,
    CellStop,
    ConveyorStop,
    FeederEnable,
    FeederFill,
)
from std_msgs.msg import String

from domain import BeltGear, CellState, ConveyorStatus

_FILL_FROM = (ConveyorStatus.EMPTY,)
_PROCESS_FROM = (
    ConveyorStatus.LOADED,
    ConveyorStatus.STOPPED,
    ConveyorStatus.HALTED,
)
_STOP_FROM = (ConveyorStatus.FEEDING, ConveyorStatus.HALTED)
_STATE_QOS = QoSProfile(
    depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL
)
_OFFSET_PUBLISH_HZ = 5.0


class CellOrchestratorNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("cell_orchestrator", **kwargs)
        self._lock = threading.Lock()
        self._status = ConveyorStatus.EMPTY
        self._belt_offset_m = 0.0
        self._feeder_remaining = 0
        self._belt_gears: list[BeltGear] = []
        self._published_belt: tuple[float, list[BeltGear]] | None = None
        # Bumped on every Process and Stop so a late result of an old goal is ignored.
        self._run_id = 0

        group = ReentrantCallbackGroup()
        self._state_pub = self.create_publisher(String, "cell/state", _STATE_QOS)
        self._run_client = ActionClient(self, ConveyorRun, "conveyor/run", callback_group=group)
        self._stop_client = self.create_client(ConveyorStop, "conveyor/stop", callback_group=group)
        self._feeder_fill_client = self.create_client(
            FeederFill, "feeder/fill", callback_group=group
        )
        self._feeder_enable_client = self.create_client(
            FeederEnable, "feeder/enable", callback_group=group
        )
        self.create_subscription(
            String, "feeder/status", self._on_feeder_status, 10, callback_group=group
        )
        self.create_service(CellFill, "cell/fill", self._on_fill, callback_group=group)
        self.create_subscription(
            String, "conveyor/status", self._on_conveyor_status, 10, callback_group=group
        )
        self.create_service(CellProcess, "cell/process", self._on_process, callback_group=group)
        self.create_service(CellStop, "cell/stop", self._on_stop, callback_group=group)
        self.create_timer(1.0 / _OFFSET_PUBLISH_HZ, self._on_offset_timer, callback_group=group)
        self._publish_state()

    def _publish_state(self) -> None:
        with self._lock:
            state = CellState(
                conveyor_status=self._status,
                feeder_remaining=self._feeder_remaining,
                belt_offset_m=self._belt_offset_m,
                belt_gears=self._belt_gears,
            )
            self._published_belt = (self._belt_offset_m, self._belt_gears)
        self._state_pub.publish(String(data=state.model_dump_json()))

    def _set_status(self, status: ConveyorStatus) -> None:
        with self._lock:
            self._status = status
        self._publish_state()

    def _on_conveyor_status(self, msg: String) -> None:
        try:
            raw = json.loads(msg.data)
            encoder_mm = float(raw["encoder_mm"])
            gears = [BeltGear(**g) for g in raw.get("gears", [])]
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed conveyor/status", throttle_duration_sec=5)
            return
        with self._lock:
            self._belt_offset_m = encoder_mm / 1000.0
            self._belt_gears = gears

    def _on_feeder_status(self, msg: String) -> None:
        try:
            remaining = int(json.loads(msg.data)["remaining"])
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed feeder/status", throttle_duration_sec=5)
            return
        with self._lock:
            changed = remaining != self._feeder_remaining
            self._feeder_remaining = remaining
        if changed:
            self._publish_state()

    def _on_offset_timer(self) -> None:
        with self._lock:
            changed = (self._belt_offset_m, self._belt_gears) != self._published_belt
        if changed:
            self._publish_state()

    def _on_fill(self, _request, response):
        if not self._feeder_fill_client.wait_for_service(timeout_sec=1.0):
            response.message = "FlexFeeder device unavailable"
            return response
        with self._lock:
            if self._status not in _FILL_FROM:
                response.message = f"Fill refused in {self._status.value}"
                return response
        # SIM seeds the deck from the controller's own entropy; tests seed it via the device.
        result = self._call_blocking(self._feeder_fill_client, FeederFill.Request(seed=0))
        if result is None or not result.success:
            response.message = "FlexFeeder refused Fill"
            return response
        self._set_status(ConveyorStatus.LOADED)
        response.success, response.message = True, "Fill started"
        return response

    @staticmethod
    def _call_blocking(client: Any, request: Any, timeout_s: float = 5.0) -> Any:
        """Reentrant callback group + multithreaded executor: waiting here does not block spin."""
        done = threading.Event()
        future = client.call_async(request)
        future.add_done_callback(lambda _: done.set())
        return future.result() if done.wait(timeout_s) else None

    def _on_process(self, _request, response):
        if not self._run_client.wait_for_server(timeout_sec=1.0):
            response.message = "Conveyor device unavailable"
            return response
        with self._lock:
            if self._status not in _PROCESS_FROM:
                response.message = f"Process refused in {self._status.value}"
                return response
            previous = self._status
            self._status = ConveyorStatus.FEEDING
            self._run_id += 1
            run_id = self._run_id
        self._publish_state()
        # Enabling is idempotent and the controller disables the feeder itself at the eye stop.
        self._feeder_enable_client.call_async(FeederEnable.Request(enable=True))
        goal = ConveyorRun.Goal(mode=ConveyorRun.Goal.RUN_TO_PICKZONE)
        self._run_client.send_goal_async(goal).add_done_callback(
            lambda fut: self._on_goal_response(fut, run_id, previous)
        )
        response.success, response.message = True, "Process started"
        return response

    def _on_goal_response(self, future: Any, run_id: int, previous: ConveyorStatus) -> None:
        handle = future.result()
        if not handle.accepted:
            self._finish_run(run_id, previous)
            return
        handle.get_result_async().add_done_callback(lambda fut: self._on_result(fut, run_id))

    def _on_result(self, future: Any, run_id: int) -> None:
        result = future.result().result
        if result.success and result.stop_reason == "STOPPED_AT_EYE":
            self._finish_run(run_id, ConveyorStatus.HALTED)
        elif result.stop_reason == "STOPPED":
            self._finish_run(run_id, ConveyorStatus.STOPPED)
        else:
            self._finish_run(run_id, ConveyorStatus.FAULT)

    def _finish_run(self, run_id: int, status: ConveyorStatus) -> None:
        with self._lock:
            if run_id != self._run_id:
                return
        self._set_status(status)

    def _on_stop(self, _request, response):
        with self._lock:
            if self._status not in _STOP_FROM:
                response.message = f"Stop refused in {self._status.value}"
                return response
            was_feeding = self._status == ConveyorStatus.FEEDING
            self._status = ConveyorStatus.STOPPED
            self._run_id += 1
        self._publish_state()
        self._feeder_enable_client.call_async(FeederEnable.Request(enable=False))
        if was_feeding:
            self._stop_client.call_async(ConveyorStop.Request()).add_done_callback(
                self._on_stop_response
            )
        response.success, response.message = True, "Stop accepted"
        return response

    def _on_stop_response(self, future: Any) -> None:
        result = future.result()
        if result is None or not result.success:
            self.get_logger().error("Conveyor stop failed; cell FAULT")
            self._set_status(ConveyorStatus.FAULT)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = CellOrchestratorNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
