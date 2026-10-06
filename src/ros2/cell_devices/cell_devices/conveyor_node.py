"""ROS2 Conveyor device node: ConveyorRun action, ConveyorStop service, status poll."""

import json
import time

import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from robot_control_interfaces.action import ConveyorRun
from robot_control_interfaces.srv import (
    CellFaultAck,
    ConveyorFinish,
    ConveyorFreeze,
    ConveyorStop,
)
from std_msgs.msg import String

from cell_devices.belt_sim import BeltParams
from cell_devices.belt_tracking import BeltTracker
from cell_devices.conveyor import ConveyorDevice, ConveyorStatus
from cell_devices.device_link import DeviceLink
from cell_devices.feeder_sim import FeederParams
from cell_devices.field_io import FieldIoError
from cell_devices.flexfeeder import PlacementRecord
from cell_devices.register_map import BeltState, Interlock

_SUCCESS_STATES = (BeltState.STOPPED_AT_EYE, BeltState.FLUSH_DONE)
# A faulted station returns HOME after FAULT_ACK: longest leg (BinExchange return) x timeout factor.
_RECOVER_TIMEOUT_S = 20.0


class ConveyorNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("conveyor", **kwargs)
        self._host = self.declare_parameter("host", "127.0.0.1").value
        self._port = self.declare_parameter("port", 5020).value
        self._counts_per_mm = self.declare_parameter(
            "counts_per_mm", BeltParams().counts_per_mm
        ).value
        self._poll_period_s = 1.0 / self.declare_parameter("poll_hz", 5.0).value

        self._link: DeviceLink[ConveyorDevice] = DeviceLink(
            self._host,
            self._port,
            lambda io: ConveyorDevice(io, self._counts_per_mm),
            self.get_logger(),
        )
        self._lock = self._link.lock  # every controller access holds it
        self._goal_active = False
        self._finish_requested = False  # Stop (D30) for the active run
        # Tracking is fed by placement records (a topic, never a call into the feeder node).
        self._tracker = BeltTracker(place_at_mm=FeederParams().place_at_mm)

        group = ReentrantCallbackGroup()
        self._status_pub = self.create_publisher(String, "conveyor/status", 10)
        self.create_subscription(
            String, "feeder/placement", self._on_placement, 50, callback_group=group
        )
        self.create_timer(self._poll_period_s, self._poll, callback_group=group)
        self.create_service(ConveyorStop, "conveyor/stop", self._handle_stop, callback_group=group)
        self.create_service(
            ConveyorFinish, "conveyor/finish", self._handle_finish, callback_group=group
        )
        self.create_service(
            ConveyorFreeze, "conveyor/freeze", self._handle_freeze, callback_group=group
        )
        self.create_service(
            CellFaultAck, "cell/fault_ack", self._handle_fault_ack, callback_group=group
        )
        self._action = ActionServer(
            self,
            ConveyorRun,
            "conveyor/run",
            execute_callback=self._execute,
            goal_callback=self._on_goal,
            cancel_callback=lambda _: CancelResponse.ACCEPT,
            callback_group=group,
        )

    def _on_placement(self, msg: String) -> None:
        try:
            raw = json.loads(msg.data)
            record = PlacementRecord(
                seq=int(raw["seq"]),
                lateral_x_mm=int(raw["lateral_x_mm"]),
                encoder_mm=float(raw["encoder_mm"]),
                color=str(raw["color"]),
                intact=bool(raw["intact"]),
            )
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning(
                "Ignoring malformed feeder/placement", throttle_duration_sec=5
            )
            return
        with self._lock:
            self._tracker.add(record)

    def _poll(self) -> ConveyorStatus | None:
        with self._lock:
            device = self._link.device_locked()
            if device is None:
                return None
            try:
                status = device.poll()
            except FieldIoError:
                self._link.drop_locked()
                return None
            gears = [
                {"id": g.id, "x": g.x, "y": g.y, "color": g.color, "intact": g.intact}
                for g in self._tracker.gears(status.encoder_mm)
            ]
        self._status_pub.publish(
            String(
                data=json.dumps(
                    {
                        "state": status.state.name,
                        "encoder_mm": status.encoder_mm,
                        "exit_count_total": status.exit_count_total,
                        "belt_fault": status.belt_fault,
                        "interlocks": {
                            flag.name.lower(): bool(status.interlocks & flag) for flag in Interlock
                        },
                        "gears": gears,
                    }
                )
            )
        )
        return status

    def _handle_stop(self, _request, response):
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                device.stop()
            except FieldIoError as err:
                self._link.drop_locked()
                response.success, response.message = False, str(err)
                return response
        response.success, response.message = True, "STOP sent"
        return response

    def _handle_finish(self, _request, response):
        """Marks the active run to finish; its loop sends FINISH_RUN after its own RUN command."""
        with self._lock:
            if self._goal_active:
                self._finish_requested = True
        response.success, response.message = True, "FINISH requested"
        return response

    def _handle_fault_ack(self, _request, response):
        """FAULT_ACK, then wait until no device is in FAULT and every station is HOME again."""
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                device.fault_ack()
            except FieldIoError as err:
                self._link.drop_locked()
                response.success, response.message = False, str(err)
                return response
        deadline = time.monotonic() + _RECOVER_TIMEOUT_S
        while time.monotonic() < deadline:
            with self._lock:
                try:
                    if device.recovered():
                        response.success, response.message = True, "Faults acknowledged"
                        return response
                except FieldIoError as err:
                    self._link.drop_locked()
                    response.success, response.message = False, str(err)
                    return response
            time.sleep(self._poll_period_s)
        response.success, response.message = False, "Cell did not recover after FAULT_ACK"
        return response

    def _handle_freeze(self, request, response):
        """The controller freezes every device, not just the belt; this node owns the link."""
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                if request.freeze:
                    device.freeze()
                else:
                    device.release_freeze()
            except FieldIoError as err:
                self._link.drop_locked()
                response.success, response.message = False, str(err)
                return response
        response.success, response.message = True, "FREEZE sent" if request.freeze else "RELEASED"
        return response

    def _on_goal(self, goal_request) -> GoalResponse:
        valid = goal_request.mode in (ConveyorRun.Goal.RUN_TO_PICKZONE, ConveyorRun.Goal.FLUSH)
        if not valid or self._goal_active:
            return GoalResponse.REJECT
        self._goal_active = True
        return GoalResponse.ACCEPT

    def _execute(self, goal_handle):
        try:
            return self._run_goal(goal_handle)
        finally:
            with self._lock:
                self._goal_active = False
                self._finish_requested = False

    def _run_goal(self, goal_handle):
        result = ConveyorRun.Result()
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                total_before = device.poll().exit_count_total
                if goal_handle.request.mode == ConveyorRun.Goal.FLUSH:
                    device.flush()
                else:
                    device.run_to_pickzone()
            except FieldIoError:
                self._link.drop_locked()
                result.stop_reason = "FAULT"
                goal_handle.abort()
                return result

        cancelled = finishing = False
        while True:
            if goal_handle.is_cancel_requested and not cancelled:
                cancelled = True
                with self._lock:
                    device.stop()
            with self._lock:
                try:
                    if self._finish_requested and not finishing and not cancelled:
                        finishing = True
                        device.finish_run()
                    status = device.poll()
                except FieldIoError:
                    self._link.drop_locked()
                    result.stop_reason = "FAULT"
                    goal_handle.abort()
                    return result
            feedback = ConveyorRun.Feedback(
                belt_state=status.state.name, encoder_mm=float(status.encoder_mm)
            )
            goal_handle.publish_feedback(feedback)
            if status.acked and status.settled:
                break
            time.sleep(self._poll_period_s)

        result.stop_reason = status.stop_reason
        result.exit_count_delta = status.exit_count_total - total_before
        result.encoder_mm = float(status.encoder_mm)
        result.success = status.state in _SUCCESS_STATES
        if cancelled:
            goal_handle.canceled()
        elif result.success:
            goal_handle.succeed()
        else:
            goal_handle.abort()
        return result


def main(args=None) -> None:
    rclpy.init(args=args)
    node = ConveyorNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
