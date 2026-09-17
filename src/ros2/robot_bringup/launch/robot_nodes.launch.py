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
ROS2 Launch configuration for UR5e bringup and workcell ecosystem.

Per ADR 0004 & Unit Refactoring-A (hand-sim-bjcw):
- Provides use_fake_hardware switch (default: true).
- If use_fake_hardware is true:
  - Generates URDF via GenericSystem mock hardware.
  - Starts robot_state_publisher.
  - Starts controller_manager (ros2_control_node) running at 500 Hz.
  - Spawns joint_state_broadcaster (streaming /joint_states at 500 Hz).
  - Spawns scaled_joint_trajectory_controller.
- If use_fake_hardware is false:
  - Invokes ur_robot_driver launch configuration for physical robot.
- Launches workcell_node and arm_controller_node.
"""

import os
from typing import List

from ament_index_python.packages import (
    PackageNotFoundError,
    get_package_share_directory,
)

from launch import LaunchContext, LaunchDescription, LaunchDescriptionEntity
from launch.actions import (
    DeclareLaunchArgument,
    IncludeLaunchDescription,
    OpaqueFunction,
)
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import (
    Command,
    FindExecutable,
    LaunchConfiguration,
    PathJoinSubstitution,
)

from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def launch_setup(
    context: LaunchContext, *args, **kwargs
) -> List[LaunchDescriptionEntity]:
    """Evaluate launch configurations and build ROS2 node graph."""
    use_fake_val = LaunchConfiguration('use_fake_hardware').perform(context)
    use_fake_hardware = use_fake_val.lower() in ('true', '1', 'yes')
    ur_type = LaunchConfiguration('ur_type').perform(context)
    robot_ip = LaunchConfiguration('robot_ip').perform(context)
    controllers_file = LaunchConfiguration('controllers_file').perform(context)

    entities: List[LaunchDescriptionEntity] = []

    if use_fake_hardware:
        # 1. Generate URDF with GenericSystem mock hardware
        xacro_file = PathJoinSubstitution(
            [
                FindPackageShare('ur_description'),
                'urdf',
                'ur_mocked.urdf.xacro',
            ]
        )
        robot_description_content = Command(
            [
                FindExecutable(name='xacro'),
                ' ',
                xacro_file,
                ' ',
                f'name:={ur_type}',
                ' ',
                f'ur_type:={ur_type}',
            ]
        )
        robot_description = {'robot_description': robot_description_content}

        # 2. Robot state publisher
        robot_state_publisher_node = Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            output='both',
            parameters=[robot_description],
        )
        entities.append(robot_state_publisher_node)

        # 3. Controller Manager (ros2_control_node running at 500 Hz)
        control_node = Node(
            package='controller_manager',
            executable='ros2_control_node',
            parameters=[controllers_file, robot_description],
            output='both',
        )
        entities.append(control_node)

        # 4. Spawners for joint_state_broadcaster and scaled_joint_trajectory
        jsb_spawner = Node(
            package='controller_manager',
            executable='spawner',
            arguments=[
                'joint_state_broadcaster',
                '--controller-manager',
                '/controller_manager',
                '--controller-manager-timeout',
                '30',
            ],
            output='both',
        )
        entities.append(jsb_spawner)

        sjtc_spawner = Node(
            package='controller_manager',
            executable='spawner',
            arguments=[
                'scaled_joint_trajectory_controller',
                '--controller-manager',
                '/controller_manager',
                '--controller-manager-timeout',
                '30',
            ],
            output='both',
        )
        entities.append(sjtc_spawner)
    else:
        # Production mode: Physical UR robot driver
        try:
            ur_driver_share = get_package_share_directory('ur_robot_driver')
            driver_launch = IncludeLaunchDescription(
                PythonLaunchDescriptionSource(
                    os.path.join(
                        ur_driver_share, 'launch', 'ur_control.launch.py'
                    )
                ),
                launch_arguments={
                    'ur_type': ur_type,
                    'robot_ip': robot_ip,
                    'use_fake_hardware': 'false',
                    'initial_joint_controller': (
                        'scaled_joint_trajectory_controller'
                    ),
                    'controllers_file': controllers_file,
                }.items(),
            )
            entities.append(driver_launch)
        except PackageNotFoundError as err:
            raise RuntimeError(
                'Physical UR hardware requested (use_fake_hardware=false), '
                f'but ur_robot_driver is not installed: {err}'
            )

    # 5. Standalone Workcell Node
    workcell_node = Node(
        package='workcell_manager',
        executable='workcell_node',
        name='workcell_node',
        output='both',
    )
    entities.append(workcell_node)

    # 6. Standalone Arm Controller Node
    arm_controller_node = Node(
        package='arm_controller',
        executable='arm_controller_node',
        name='arm_controller_node',
        output='both',
    )
    entities.append(arm_controller_node)

    return entities


def generate_launch_description() -> LaunchDescription:
    """Generate launch description with arguments and opaque launcher."""
    default_controllers = PathJoinSubstitution(
        [
            FindPackageShare('robot_bringup'),
            'config',
            'ur_controllers.yaml',
        ]
    )

    declared_arguments = [
        DeclareLaunchArgument(
            'use_fake_hardware',
            default_value='true',
            description=(
                'Start robot with fake hardware (GenericSystem mock) '
                'if true, or physical UR driver'
            ),
        ),
        DeclareLaunchArgument(
            'ur_type',
            default_value='ur5e',
            description='Type of UR robot (ur3, ur5, ur5e, ur10, ur10e)',
        ),
        DeclareLaunchArgument(
            'robot_ip',
            default_value='192.168.1.100',
            description='IP address of physical Universal Robot',
        ),
        DeclareLaunchArgument(
            'controllers_file',
            default_value=default_controllers,
            description='Path to controller configurations YAML file',
        ),
    ]

    return LaunchDescription(
        declared_arguments + [OpaqueFunction(function=launch_setup)]
    )
