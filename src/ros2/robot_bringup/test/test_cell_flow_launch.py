"""Unit 9.24 (hand-sim-k9xh): the full SIM cell graph, launched for real, runs the whole flow.

robot_nodes.launch.py with virtual_plc. Fill -> Process twice (two seeded-by-entropy decks):
every Pallet is exchanged at least once (each colour reaches 10), the ScrapBin is exchanged once
it holds BIN_EXCHANGE_THRESHOLD, no device faults, and a reset ends EMPTY with every count 0.

The controller runs SIM time sped up and the device nodes poll fast; the arm's motion is real
time (fake ros2_control hardware), so two decks take about 8 minutes. Not part of verify; run it
with `colcon test --packages-select robot_bringup` or
`launch_test src/ros2/robot_bringup/test/test_cell_flow_launch.py`.
"""

import json
import os
import threading
import time
import unittest

import launch_testing.actions
import pytest
import rclpy
from controller_manager_msgs.srv import SwitchController
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from rclpy.executors import MultiThreadedExecutor
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.srv import CellFill, CellProcess, CellReset
from std_msgs.msg import String

from domain import BIN_EXCHANGE_THRESHOLD

_LAUNCH = os.path.join(os.path.dirname(__file__), "..", "launch", "robot_nodes.launch.py")
_DECK_TIMEOUT_S = 400.0
_PALLETS = ("WHITE", "GREEN", "BLUE")


@pytest.mark.launch_test
def generate_test_description():
    return (
        LaunchDescription(
            [
                IncludeLaunchDescription(
                    PythonLaunchDescriptionSource(os.path.abspath(_LAUNCH)),
                    launch_arguments={
                        "use_fake_hardware": "true",
                        "use_virtual_plc": "true",
                        "controller_port": "15031",
                        "sim_time_scale": "40.0",
                        "device_poll_hz": "50.0",
                        "arm_step_duration": "0.02",
                    }.items(),
                ),
                launch_testing.actions.ReadyToTest(),
            ]
        ),
        {},
    )


class TestCellFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not rclpy.ok():
            rclpy.init()
        cls.node = rclpy.create_node("cell_flow_test")
        cls.states: list[dict] = []
        cls.faults: list[str] = []
        cls.node.create_subscription(
            String,
            "/cell/state",
            lambda m: cls.states.append(json.loads(m.data)),
            QoSProfile(
                depth=50,
                reliability=ReliabilityPolicy.RELIABLE,
                durability=DurabilityPolicy.TRANSIENT_LOCAL,
            ),
        )
        cls.node.create_subscription(String, "/cell/fault", lambda m: cls.faults.append(m.data), 10)
        cls.executor = MultiThreadedExecutor()
        cls.executor.add_node(cls.node)
        cls.spinner = threading.Thread(target=cls.executor.spin, daemon=True)
        cls.spinner.start()

    @classmethod
    def tearDownClass(cls):
        cls.executor.shutdown()
        cls.node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()

    def _call(self, srv, name, request, timeout=30.0):
        client = self.node.create_client(srv, name)
        self.assertTrue(client.wait_for_service(timeout_sec=timeout), f"{name} not available")
        done = threading.Event()
        future = client.call_async(request)
        future.add_done_callback(lambda _: done.set())
        self.assertTrue(done.wait(timeout), f"{name} did not answer")
        return future.result()

    def _status(self) -> str:
        return self.states[-1]["conveyor_status"] if self.states else ""

    def _counts(self) -> dict[str, int]:
        return {s["name"]: s["count"] for s in self.states[-1]["stations"]}

    def _wait_status(self, *wanted: str, timeout: float) -> str:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if self._status() in wanted:
                return self._status()
            time.sleep(0.05)
        self.fail(f"cell never reached {wanted}; last {self._status()}, faults {self.faults}")

    def _engage_arm(self) -> None:
        """What the EdgeNode does on a Gateway connect: activate the parked controllers."""
        request = SwitchController.Request(
            activate_controllers=["joint_state_broadcaster", "scaled_joint_trajectory_controller"],
            strictness=SwitchController.Request.STRICT,
            activate_asap=True,
        )
        end = time.monotonic() + 60.0
        while time.monotonic() < end:  # the spawners may still be loading them
            if self._call(SwitchController, "/controller_manager/switch_controller", request).ok:
                return
            time.sleep(1.0)
        self.fail("controllers never activated")

    def _run_deck(self) -> None:
        self._wait_status("EMPTY", timeout=60.0)
        self.assertTrue(self._call(CellFill, "/cell/fill", CellFill.Request()).success)
        self._wait_status("LOADED", timeout=30.0)
        self.assertTrue(self._call(CellProcess, "/cell/process", CellProcess.Request()).success)
        self._wait_status("FEEDING", "HALTED", timeout=30.0)
        self._wait_status("EMPTY", "FAULT", timeout=_DECK_TIMEOUT_S)

    def test_two_decks_exchange_every_pallet_and_the_bin_then_reset_empty(self):
        self._engage_arm()

        self._run_deck()
        self._run_deck()

        self.assertEqual(self.faults, [])
        self.assertEqual(self._status(), "EMPTY")
        history = [{s["name"]: s for s in st["stations"]} for st in self.states]
        left = {name for h in history for name, s in h.items() if s["exchange_state"] != "HOME"}
        self.assertEqual(left, {*_PALLETS, "SCRAP"})  # every Pallet and the bin left and came back
        for color in _PALLETS:
            self.assertIn(10, {h[color]["count"] for h in history}, f"{color} never FULL")
        self.assertGreaterEqual(max(h["SCRAP"]["count"] for h in history), BIN_EXCHANGE_THRESHOLD)
        # Each deck is 30 per colour: three full Pallets each, nothing left over, nothing lost.
        self.assertEqual({c: self._counts()[c] for c in _PALLETS}, dict.fromkeys(_PALLETS, 0))

        self.assertTrue(self._call(CellReset, "/cell/reset", CellReset.Request()).success)
        self._wait_status("RESETTING", "EMPTY", timeout=10.0)
        self._wait_status("EMPTY", "FAULT", timeout=120.0)
        self.assertEqual(self._status(), "EMPTY")
        self.assertEqual(self.faults, [])
        self.assertEqual(set(self._counts().values()), {0})
