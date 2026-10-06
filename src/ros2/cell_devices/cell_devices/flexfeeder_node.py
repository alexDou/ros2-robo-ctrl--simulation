"""ROS2 FlexFeeder device node: fill / enable / quick-empty services, status + placement topics."""

import json

import rclpy
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from robot_control_interfaces.srv import FeederEnable, FeederFill, FeederQuickEmpty
from std_msgs.msg import String

from cell_devices.belt_sim import BeltParams
from cell_devices.device_link import DeviceLink
from cell_devices.field_io import FieldIoError
from cell_devices.flexfeeder import FlexFeederDevice


class FlexFeederNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("flexfeeder", **kwargs)
        self._host = self.declare_parameter("host", "127.0.0.1").value
        self._port = self.declare_parameter("port", 5020).value
        self._counts_per_mm = self.declare_parameter(
            "counts_per_mm", BeltParams().counts_per_mm
        ).value
        poll_period_s = 1.0 / self.declare_parameter("poll_hz", 5.0).value

        self._link: DeviceLink[FlexFeederDevice] = DeviceLink(
            self._host,
            self._port,
            lambda io: FlexFeederDevice(io, self._counts_per_mm),
            self.get_logger(),
        )
        self._lock = self._link.lock  # every controller access holds it

        group = ReentrantCallbackGroup()
        self._status_pub = self.create_publisher(String, "feeder/status", 10)
        self._placement_pub = self.create_publisher(String, "feeder/placement", 50)
        self.create_timer(poll_period_s, self._poll, callback_group=group)
        self.create_service(FeederFill, "feeder/fill", self._on_fill, callback_group=group)
        self.create_service(FeederEnable, "feeder/enable", self._on_enable, callback_group=group)
        self.create_service(
            FeederQuickEmpty, "feeder/quick_empty", self._on_quick_empty, callback_group=group
        )

    def _poll(self) -> None:
        with self._lock:
            device = self._link.device_locked()
            if device is None:
                return
            try:
                status = device.poll()
            except FieldIoError:
                self._link.drop_locked()
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
            String(
                data=json.dumps(
                    {
                        "state": status.state.name,
                        "remaining": status.remaining,
                        "fault": status.fault,
                    }
                )
            )
        )

    def _send(self, action, response, ok_message: str):
        with self._lock:
            device = self._link.device_locked()
            try:
                if device is None:
                    raise FieldIoError("cell controller unreachable")
                action(device)
            except FieldIoError as err:
                self._link.drop_locked()
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
