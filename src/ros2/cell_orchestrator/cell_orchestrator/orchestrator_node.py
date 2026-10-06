"""CellOrchestratorNode: ROS wiring around the Cell state machine.

Fill loads the FlexFeeder (EMPTY -> LOADED), Process feeds the belt to the PickZone eye, and at
every eye stop the Batch is registered and sorted one SortCycle at a time; a FULL Pallet is
exchanged inside its SortCycle, a full-enough ScrapBin leaves at the belt stop. Stop lets what
is running finish (the belt still reaches the eye); EmergencyStop freezes every device at once; Reset (CLEAR_WORKSPACE on
connect, RESET_FAULT) is a physical flush ending EMPTY. The rules live in `cell`, `sort_cycle`
and `flush_reset`; this node turns topics and services into Cell events.
"""

import json

import rclpy
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import ExternalShutdownException, MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.srv import CellFill, CellProcess, CellReset, CellStop
from std_msgs.msg import String

from cell_orchestrator.cell import Cell
from cell_orchestrator.ports import CellPorts
from domain import BeltGear, CellState

_STATE_QOS = QoSProfile(
    depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL
)
_OFFSET_PUBLISH_HZ = 5.0


class CellOrchestratorNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("cell_orchestrator", **kwargs)
        group = ReentrantCallbackGroup()
        self._state_pub = self.create_publisher(String, "cell/state", _STATE_QOS)
        self._fault_pub = self.create_publisher(String, "cell/fault", 10)
        self.ports = CellPorts(self)
        self.cell = Cell(self.ports, self._publish_state, self._publish_fault, self.get_logger())
        self.create_subscription(
            String, "conveyor/status", self._on_conveyor_status, 10, callback_group=group
        )
        self.create_subscription(
            String, "feeder/status", self._on_feeder_status, 10, callback_group=group
        )
        self.create_service(CellFill, "cell/fill", self._on_fill, callback_group=group)
        self.create_service(CellProcess, "cell/process", self._on_process, callback_group=group)
        self.create_service(CellStop, "cell/stop", self._on_stop, callback_group=group)
        self.create_service(CellReset, "cell/reset", self._on_reset, callback_group=group)
        self.create_service(
            CellStop, "cell/emergency_stop", self._on_emergency_stop, callback_group=group
        )
        self.create_timer(
            1.0 / _OFFSET_PUBLISH_HZ,
            lambda: self.cell.post(self.cell.on_offset_tick),
            callback_group=group,
        )

    def destroy_node(self) -> None:
        self.cell.close()
        super().destroy_node()

    def _publish_state(self, state: CellState) -> None:
        self._state_pub.publish(String(data=state.model_dump_json()))

    def _publish_fault(self, device: str, code: str) -> None:
        self._fault_pub.publish(String(data=json.dumps({"device": device, "code": code})))

    def _on_conveyor_status(self, msg: String) -> None:
        try:
            raw = json.loads(msg.data)
            offset_m = float(raw["encoder_mm"]) / 1000.0
            gears = [BeltGear(**g) for g in raw.get("gears", [])]
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed conveyor/status", throttle_duration_sec=5)
            return
        self.cell.post(self.cell.on_belt_status, offset_m, gears)

    def _on_feeder_status(self, msg: String) -> None:
        try:
            remaining = int(json.loads(msg.data)["remaining"])
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed feeder/status", throttle_duration_sec=5)
            return
        self.cell.post(self.cell.on_feeder_remaining, remaining)

    @staticmethod
    def _respond(response, outcome: tuple[bool, str]):
        response.success, response.message = outcome
        return response

    def _on_fill(self, _request, response):
        if not self.ports.feeder_fill_client.wait_for_service(timeout_sec=1.0):
            return self._respond(response, (False, "FlexFeeder device unavailable"))
        return self._respond(response, self.cell.ask(self.cell.fill))

    def _on_process(self, _request, response):
        if not self.ports.run_client.wait_for_server(timeout_sec=1.0):
            return self._respond(response, (False, "Conveyor device unavailable"))
        return self._respond(response, self.cell.ask(self.cell.process))

    def _on_stop(self, _request, response):
        return self._respond(response, self.cell.ask(self.cell.stop))

    def _on_reset(self, _request, response):
        return self._respond(response, self.cell.ask(self.cell.reset))

    def _on_emergency_stop(self, _request, response):
        """Software EmergencyStop (D31): FREEZE the devices and stop the arm where it is, first,
        never queued behind other events."""
        self.ports.freeze(
            lambda: self.get_logger().error("Device freeze failed; hardware E-stop chain must act")
        )
        self.ports.cancel_arm()  # arm_controller safe-stops in place
        return self._respond(response, self.cell.ask(self.cell.emergency_stop))


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
