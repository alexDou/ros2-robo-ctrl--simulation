"""ROS2 FlexFeeder device node: fill / enable / quick-empty services, status + placement topics."""

import json
import threading

import rclpy
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from robot_control_interfaces.srv import FeederEnable, FeederFill, FeederQuickEmpty
from std_msgs.msg import String

from cell_devices.belt_sim import BeltParams
from cell_devices.field_io import FieldIoError
from cell_devices.flexfeeder import FlexFeederDevice
from cell_devices.modbus_adapter import ModbusFieldIo


class FlexFeederNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("flexfeeder", **kwargs)
        self._host = self.declare_parameter("host", "127.0.0.1").value
        self._port = self.declare_parameter("port", 5020).value
        self._counts_per_mm = self.declare_parameter(
            "counts_per_mm", BeltParams().counts_per_mm
        ).value
        poll_period_s = 1.0 / self.declare_parameter("poll_hz", 5.0).value

        # ModbusFieldIo is not thread-safe; the poll timer and the services share it.
        self._lock = threading.Lock()
        self._io: ModbusFieldIo | None = None
        self._device: FlexFeederDevice | None = None

        group = ReentrantCallbackGroup()
        self._status_pub = self.create_publisher(String, "feeder/status", 10)
        self._placement_pub = self.create_publisher(String, "feeder/placement", 50)
        self.create_timer(poll_period_s, self._poll, callback_group=group)
        self.create_service(FeederFill, "feeder/fill", self._on_fill, callback_group=group)
        self.create_service(FeederEnable, "feeder/enable", self._on_enable, callback_group=group)
        self.create_service(
            FeederQuickEmpty, "feeder/quick_empty", self._on_quick_empty, callback_group=group
        )

    def _connected_device_locked(self) -> FlexFeederDevice | None:
        if self._device is None:
            try:
                io = ModbusFieldIo(self._host, self._port)
                io.connect()
                self._io, self._device = io, FlexFeederDevice(io, self._counts_per_mm)
            except FieldIoError as err:
                self.get_logger().warning(
                    f"cell controller unreachable: {err}", throttle_duration_sec=5.0
                )
        return self._device

    def _drop_connection_locked(self) -> None:
        if self._io is not None:
            self._io.close()
        self._io = self._device = None

    def _poll(self) -> None:
        with self._lock:
            device = self._connected_device_locked()
            if device is None:
                return
            try:
                status = device.poll()
            except FieldIoError:
                self._drop_connection_locked()
                return
        # Each placement is published once; the orchestrator registers them at the eye stop.
        for p in status.new_placements:
            self._placement_pub.publish(
                String(
                    data=json.dumps(
                        {
                            "seq": p.seq,
                            "lateral_x_mm": p.lateral_x_mm,
                            "encoder_mm": p.encoder_mm,
                            "color": p.color,
                            "intact": p.intact,
                        }
                    )
                )
            )
        self._status_pub.publish(
            String(data=json.dumps({"state": status.state.name, "remaining": status.remaining}))
        )

    def _send(self, action, response, ok_message: str):
        with self._lock:
            device = self._connected_device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                action(device)
            except FieldIoError as err:
                self._drop_connection_locked()
                response.success, response.message = False, str(err)
                return response
        response.success, response.message = True, ok_message
        return response

    def _on_fill(self, request, response):
        return self._send(lambda d: d.fill(request.seed), response, "FILL sent")

    def _on_enable(self, request, response):
        if request.enable:
            return self._send(lambda d: d.enable(), response, "ENABLE sent")
        return self._send(lambda d: d.disable(), response, "DISABLE sent")

    def _on_quick_empty(self, _request, response):
        return self._send(lambda d: d.quick_empty(), response, "QUICK_EMPTY sent")


def main(args=None) -> None:
    rclpy.init(args=args)
    node = FlexFeederNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
