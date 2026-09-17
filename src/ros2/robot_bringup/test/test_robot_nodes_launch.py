# Copyright 2026 alexDou.
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Launch integration test for robot_bringup package.

Verifies:
- All nodes in robot_nodes.launch.py spin up without crashing:
  - controller_manager
  - robot_state_publisher
  - workcell_node
  - arm_controller_node
- Spawners activate joint_state_broadcaster and scaled_joint_trajectory
- Workcell services and arm controller action server are available
- /joint_states publishes at 500 Hz (~2ms RTDE loop)
"""

import os
import time
import unittest

from ament_index_python.packages import get_package_share_directory

from control_msgs.action import FollowJointTrajectory

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource

import launch_testing
import launch_testing.actions

import pytest

import rclpy
from rclpy.action import ActionClient
from rclpy.qos import qos_profile_sensor_data

from robot_control_interfaces.action import PickAndPlace

from sensor_msgs.msg import JointState


@pytest.mark.launch_test
def generate_test_description():
    """Generate launch description for testing robot bringup."""
    try:
        bringup_share = get_package_share_directory('robot_bringup')
        launch_path = os.path.join(
            bringup_share, 'launch', 'robot_nodes.launch.py'
        )
    except Exception:
        candidates = [
            os.path.join(
                os.path.dirname(__file__),
                '..',
                'launch',
                'robot_nodes.launch.py',
            ),
            os.path.join(
                os.path.dirname(__file__),
                '..',
                'src',
                'ros2',
                'robot_bringup',
                'launch',
                'robot_nodes.launch.py',
            ),
        ]
        launch_path = next(
            (os.path.abspath(c) for c in candidates if os.path.exists(c)),
            None,
        )

    return (
        LaunchDescription(
            [
                IncludeLaunchDescription(
                    PythonLaunchDescriptionSource(launch_path),
                    launch_arguments={'use_fake_hardware': 'true'}.items(),
                ),
                launch_testing.actions.ReadyToTest(),
            ]
        ),
        {},
    )


class TestRobotNodesBringup(unittest.TestCase):
    """Integration test suite verifying robot_bringup node graph."""

    @classmethod
    def setUpClass(cls):
        """Initialize ROS2 context."""
        if not rclpy.ok():
            rclpy.init()

    @classmethod
    def tearDownClass(cls):
        """Shutdown ROS2 context."""
        if rclpy.ok():
            rclpy.shutdown()

    def setUp(self):
        """Create monitor test node."""
        self.node = rclpy.create_node('test_robot_nodes_monitor')

    def tearDown(self):
        """Destroy monitor test node."""
        self.node.destroy_node()

    def test_nodes_and_services_active(self):
        """Assert all expected nodes and services are active."""
        expected_nodes = {
            'controller_manager',
            'robot_state_publisher',
            'workcell_node',
            'arm_controller_node',
        }

        # Poll node list until all appear or 15s timeout
        start_time = time.time()
        found_nodes = set()
        while time.time() - start_time < 15.0:
            current_nodes = set(self.node.get_node_names())
            found_nodes = expected_nodes.intersection(current_nodes)
            if found_nodes == expected_nodes:
                break
            rclpy.spin_once(self.node, timeout_sec=0.2)

        self.assertEqual(
            found_nodes,
            expected_nodes,
            f'Missing nodes: {expected_nodes - found_nodes}. '
            f'Current nodes: {self.node.get_node_names()}',
        )

        # Check workcell services
        services = dict(self.node.get_service_names_and_types())
        self.assertIn('/workcell/get_drop_slot', services)
        self.assertIn('/workcell/clear_workspace', services)

    def test_controllers_and_action_servers_ready(self):
        """Assert controllers and action servers are ready."""
        # Check scaled_joint_trajectory_controller action
        sjtc_client = ActionClient(
            self.node,
            FollowJointTrajectory,
            '/scaled_joint_trajectory_controller/follow_joint_trajectory',
        )
        sjtc_ready = sjtc_client.wait_for_server(timeout_sec=15.0)
        sjtc_client.destroy()
        self.assertTrue(
            sjtc_ready,
            'scaled_joint_trajectory_controller action server not ready',
        )

        # Check arm_controller pick_and_place action
        pap_client = ActionClient(
            self.node,
            PickAndPlace,
            '/arm_controller/pick_and_place',
        )
        pap_ready = pap_client.wait_for_server(timeout_sec=15.0)
        pap_client.destroy()
        self.assertTrue(
            pap_ready,
            'arm_controller pick_and_place action server not ready',
        )

    def test_joint_states_500hz_frequency(self):
        """Assert /joint_states streams at 500 Hz (~2ms RTDE loop)."""
        received_stamps = []
        received_wall_times = []

        def js_callback(msg: JointState):
            stamp_sec = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
            received_stamps.append(stamp_sec)
            received_wall_times.append(time.perf_counter())

        sub = self.node.create_subscription(
            JointState,
            '/joint_states',
            js_callback,
            qos_profile_sensor_data,
        )

        # Collect at least 150 samples
        target_samples = 150
        start_time = time.time()
        timeout = 10.0

        while len(received_stamps) < target_samples and (
            time.time() - start_time < timeout
        ):
            rclpy.spin_once(self.node, timeout_sec=0.01)

        self.node.destroy_subscription(sub)

        sample_count = len(received_stamps)
        self.assertGreaterEqual(
            sample_count,
            target_samples,
            f'Received only {sample_count} samples in {timeout}s',
        )

        # Calculate frequency from message timestamps (header.stamp)
        stamp_duration = received_stamps[-1] - received_stamps[0]
        self.assertGreater(stamp_duration, 0.0, 'Stamp duration must be > 0')
        stamp_hz = (len(received_stamps) - 1) / stamp_duration

        # Calculate frequency from reception wall time
        wall_duration = received_wall_times[-1] - received_wall_times[0]
        self.assertGreater(wall_duration, 0.0, 'Wall duration must be > 0')
        wall_hz = (len(received_wall_times) - 1) / wall_duration

        self.node.get_logger().info(
            f'Measured /joint_states frequency: '
            f'stamp_hz={stamp_hz:.2f}, wall_hz={wall_hz:.2f}'
        )

        # RTDE loop target is 500 Hz. Verify frequency is around 500 Hz
        self.assertGreaterEqual(
            stamp_hz,
            400.0,
            f'Expected /joint_states rate >= 400 Hz, got {stamp_hz:.2f} Hz',
        )
        self.assertLessEqual(
            stamp_hz,
            600.0,
            f'Expected /joint_states rate <= 600 Hz, got {stamp_hz:.2f} Hz',
        )
