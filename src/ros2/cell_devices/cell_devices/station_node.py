"""ROS2 Station device node: StationExchange action. One node type, one instance per station."""

import time

import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from robot_control_interfaces.action import StationExchange

from cell_devices.device_link import DeviceLink
from cell_devices.field_io import FieldIoError
from cell_devices.register_map import STATIONS, StationState
from cell_devices.station import StationDevice


class StationNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("station", **kwargs)
        self._station = self.declare_parameter("station", "white").value
        if self._station not in STATIONS:
            raise ValueError(f"station must be one of {STATIONS}, got {self._station!r}")
        self._host = self.declare_parameter("host", "127.0.0.1").value
        self._port = self.declare_parameter("port", 5020).value
        self._poll_period_s = 1.0 / self.declare_parameter("poll_hz", 5.0).value

        self._link: DeviceLink[StationDevice] = DeviceLink(
            self._host, self._port, lambda io: StationDevice(io, self._station), self.get_logger()
        )
        self._lock = self._link.lock  # every controller access holds it
        self._goal_active = False

        self._action = ActionServer(
            self,
            StationExchange,
            f"station/{self._station}/exchange",
            execute_callback=self._execute,
            goal_callback=self._on_goal,
            # An exchange in flight always completes (spec D22): nothing is stranded halfway.
            cancel_callback=lambda _: CancelResponse.REJECT,
            callback_group=ReentrantCallbackGroup(),
        )

    def _on_goal(self, _goal_request) -> GoalResponse:
        if self._goal_active:
            return GoalResponse.REJECT
        self._goal_active = True
        return GoalResponse.ACCEPT

    def _execute(self, goal_handle):
        try:
            return self._run_goal(goal_handle)
        finally:
            self._goal_active = False

    def _fail(self, goal_handle, state: str = "FAULT", fault: int = 0):
        goal_handle.abort()
        return StationExchange.Result(success=False, final_state=state, fault=fault)

    def _run_goal(self, goal_handle):
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                status = device.poll()
                if status.state != StationState.HOME:
                    return self._fail(goal_handle, status.state.name, status.fault)
                device.exchange()
            except FieldIoError:
                self._link.drop_locked()
                return self._fail(goal_handle)

        while True:
            with self._lock:
                try:
                    status = device.poll()
                except FieldIoError:
                    self._link.drop_locked()
                    return self._fail(goal_handle)
            goal_handle.publish_feedback(StationExchange.Feedback(exchange_state=status.state.name))
            if status.acked and status.settled:
                break
            time.sleep(self._poll_period_s)

        success = status.state == StationState.HOME
        result = StationExchange.Result(
            success=success, final_state=status.state.name, fault=status.fault
        )
        if success:
            goal_handle.succeed()
        else:
            goal_handle.abort()
        return result


def main(args=None) -> None:
    rclpy.init(args=args)
    node = StationNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
