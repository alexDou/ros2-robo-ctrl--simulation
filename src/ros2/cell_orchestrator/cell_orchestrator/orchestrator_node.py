"""CellOrchestratorNode: owns ConveyorStatus and drives the conveyor device.

Minimal tracer slice (Unit 9.05): Process runs the belt to the PickZone eye, Stop freezes it.
Fill, SortCycles, exchanges and the flush reset land in later Unit 9 tickets.
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
from robot_control_interfaces.srv import CellProcess, CellStop, ConveyorStop
from std_msgs.msg import String

from domain import CellState, ConveyorStatus

# Fill gating arrives with its own ticket; until then EMPTY may be processed so the tracer runs.
_PROCESS_FROM = (
    ConveyorStatus.EMPTY,
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
        self._published_offset_m: float | None = None
        # Bumped on every Process and Stop so a late result of an old goal is ignored.
        self._run_id = 0

        group = ReentrantCallbackGroup()
        self._state_pub = self.create_publisher(String, "cell/state", _STATE_QOS)
        self._run_client = ActionClient(self, ConveyorRun, "conveyor/run", callback_group=group)
        self._stop_client = self.create_client(ConveyorStop, "conveyor/stop", callback_group=group)
        self.create_subscription(
            String, "conveyor/status", self._on_conveyor_status, 10, callback_group=group
        )
        self.create_service(CellProcess, "cell/process", self._on_process, callback_group=group)
        self.create_service(CellStop, "cell/stop", self._on_stop, callback_group=group)
        self.create_timer(1.0 / _OFFSET_PUBLISH_HZ, self._on_offset_timer, callback_group=group)
        self._publish_state()

    def _publish_state(self) -> None:
        with self._lock:
            state = CellState(conveyor_status=self._status, belt_offset_m=self._belt_offset_m)
            self._published_offset_m = self._belt_offset_m
        self._state_pub.publish(String(data=state.model_dump_json()))

    def _set_status(self, status: ConveyorStatus) -> None:
        with self._lock:
            self._status = status
        self._publish_state()

    def _on_conveyor_status(self, msg: String) -> None:
        try:
            encoder_mm = float(json.loads(msg.data)["encoder_mm"])
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed conveyor/status", throttle_duration_sec=5)
            return
        with self._lock:
            self._belt_offset_m = encoder_mm / 1000.0

    def _on_offset_timer(self) -> None:
        with self._lock:
            changed = self._belt_offset_m != self._published_offset_m
        if changed:
            self._publish_state()

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
