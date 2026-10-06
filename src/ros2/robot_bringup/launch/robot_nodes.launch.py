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
  - Starts controller_manager (ros2_control_node) running at 5 Hz sim
    (GenericSystem fake hardware, non-RT host; real UR uses ur_controllers_real.yaml at 500 Hz).
  - Spawns joint_state_broadcaster + scaled_joint_trajectory_controller
    --inactive (parked: no /joint_states traffic until ENGAGE handshake
    from Gateway activates them via switch_controller).
- If use_fake_hardware is false:
  - Invokes ur_robot_driver launch configuration for physical robot.
- Launches workcell_node and arm_controller_node.
- Unit 9: virtual_plc (SIM cell controller, Modbus TCP) starts only when use_fake_hardware
  and use_virtual_plc are both true; controller_host/controller_port address the controller
  (virtual_plc binds there in SIM, device nodes connect there). The cell graph always starts:
  conveyor, flexfeeder, four stations (white, green, blue, scrap) and cell_orchestrator.
"""

import os

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


def launch_setup(context: LaunchContext, *args, **kwargs) -> list[LaunchDescriptionEntity]:
    """Evaluate launch configurations and build ROS2 node graph."""
    use_fake_val = LaunchConfiguration("use_fake_hardware").perform(context)
    use_fake_hardware = use_fake_val.lower() in ("true", "1", "yes")
    ur_type = LaunchConfiguration("ur_type").perform(context)
    robot_ip = LaunchConfiguration("robot_ip").perform(context)
    controllers_file = LaunchConfiguration("controllers_file").perform(context)
    robot_id = LaunchConfiguration("robot_id").perform(context)
    use_virtual_plc = LaunchConfiguration("use_virtual_plc").perform(context).lower() in (
        "true",
        "1",
        "yes",
    )
    controller_host = LaunchConfiguration("controller_host").perform(context)
    controller_port = int(LaunchConfiguration("controller_port").perform(context))
    sim_time_scale = float(LaunchConfiguration("sim_time_scale").perform(context))
    arm_step_duration = float(LaunchConfiguration("arm_step_duration").perform(context))
    device_poll_hz = float(LaunchConfiguration("device_poll_hz").perform(context))

    if not use_fake_hardware and controllers_file.endswith("ur_controllers.yaml"):
        # Default sim config is 5 Hz; physical UR needs 500 Hz RTDE loop.
        controllers_file = controllers_file.replace(
            "ur_controllers.yaml", "ur_controllers_real.yaml"
        )

    entities: list[LaunchDescriptionEntity] = []

    if use_fake_hardware:
        # 1. Generate URDF with GenericSystem mock hardware
        xacro_file = PathJoinSubstitution(
            [
                FindPackageShare("ur_description"),
                "urdf",
                "ur_mocked.urdf.xacro",
            ]
        )
        robot_description_content = Command(
            [
                FindExecutable(name="xacro"),
                " ",
                xacro_file,
                " ",
                f"name:={ur_type}",
                " ",
                f"ur_type:={ur_type}",
            ]
        )
        robot_description = {"robot_description": robot_description_content}

        # 2. Robot state publisher
        robot_state_publisher_node = Node(
            package="robot_state_publisher",
            executable="robot_state_publisher",
            output="both",
            parameters=[robot_description],
        )
        entities.append(robot_state_publisher_node)

        # 3. Controller Manager (ros2_control_node at 5 Hz sim; 500 Hz only for real UR)
        control_node = Node(
            package="controller_manager",
            executable="ros2_control_node",
            parameters=[controllers_file, robot_description],
            output="both",
        )
        entities.append(control_node)

        # 4. Spawners for joint_state_broadcaster and scaled_joint_trajectory
        # --inactive: load+configure only; EdgeBridge activates on ENGAGE
        # handshake (Gateway WS connect) via /controller_manager/switch_controller,
        # and deactivates again on STANDBY. Parked = zero /joint_states traffic.
        jsb_spawner = Node(
            package="controller_manager",
            executable="spawner",
            arguments=[
                "joint_state_broadcaster",
                "--controller-manager",
                "/controller_manager",
                "--controller-manager-timeout",
                "30",
                "--inactive",
            ],
            output="both",
        )
        entities.append(jsb_spawner)

        sjtc_spawner = Node(
            package="controller_manager",
            executable="spawner",
            arguments=[
                "scaled_joint_trajectory_controller",
                "--controller-manager",
                "/controller_manager",
                "--controller-manager-timeout",
                "30",
                "--inactive",
            ],
            output="both",
        )
        entities.append(sjtc_spawner)
    else:
        # Production mode: Physical UR robot driver
        try:
            ur_driver_share = get_package_share_directory("ur_robot_driver")
            driver_launch = IncludeLaunchDescription(
                PythonLaunchDescriptionSource(
                    os.path.join(ur_driver_share, "launch", "ur_control.launch.py")
                ),
                launch_arguments={
                    "ur_type": ur_type,
                    "robot_ip": robot_ip,
                    "use_fake_hardware": "false",
                    "initial_joint_controller": ("scaled_joint_trajectory_controller"),
                    "controllers_file": controllers_file,
                }.items(),
            )
            entities.append(driver_launch)
        except PackageNotFoundError as err:
            raise RuntimeError(
                "Physical UR hardware requested (use_fake_hardware=false), "
                f"but ur_robot_driver is not installed: {err}"
            ) from err

    # 5. SIM cell controller (never alongside a physical cell)
    if use_fake_hardware and use_virtual_plc:
        entities.append(
            Node(
                package="cell_devices",
                executable="virtual_plc",
                name="virtual_plc",
                output="both",
                parameters=[
                    {"host": controller_host, "port": controller_port, "time_scale": sim_time_scale}
                ],
            )
        )

    # 5b. Cell devices (Unit 9): each talks Modbus TCP to the cell controller, the virtual_plc in
    # SIM or the real one at controller_host:controller_port; the orchestrator owns the flow.
    controller = {"host": controller_host, "port": controller_port, "poll_hz": device_poll_hz}
    entities += [
        Node(
            package="cell_devices",
            executable="conveyor_node",
            name="conveyor",
            output="both",
            parameters=[controller],
        ),
        Node(
            package="cell_devices",
            executable="flexfeeder_node",
            name="flexfeeder",
            output="both",
            parameters=[controller],
        ),
        *(
            Node(
                package="cell_devices",
                executable="station_node",
                name=f"station_{station}",
                output="both",
                parameters=[{**controller, "station": station}],
            )
            for station in ("white", "green", "blue", "scrap")
        ),
        Node(
            package="cell_orchestrator",
            executable="cell_orchestrator",
            name="cell_orchestrator",
            output="both",
        ),
    ]

    # 6. Standalone Workcell Node
    workcell_node = Node(
        package="workcell_manager",
        executable="workcell_node",
        name="workcell_node",
        output="both",
    )
    entities.append(workcell_node)

    # 7. Standalone Arm Controller Node
    arm_controller_node = Node(
        package="arm_controller",
        executable="arm_controller_node",
        name="arm_controller_node",
        output="both",
        parameters=[{"step_duration": arm_step_duration}],
    )
    entities.append(arm_controller_node)

    # 8. Edge Bridge Node (Zenoh DataFabric command bridge)
    edge_bridge_node = Node(
        package="arm_controller",
        executable="edge_bridge_node",
        name="edge_bridge_node",
        output="both",
        parameters=[{"robot_id": robot_id}],
    )
    entities.append(edge_bridge_node)

    return entities


def generate_launch_description() -> LaunchDescription:
    """Generate launch description with arguments and opaque launcher."""
    default_controllers = PathJoinSubstitution(
        [
            FindPackageShare("robot_bringup"),
            "config",
            "ur_controllers.yaml",
        ]
    )

    declared_arguments = [
        DeclareLaunchArgument(
            "use_fake_hardware",
            default_value="true",
            description=(
                "Start robot with fake hardware (GenericSystem mock) if true, or physical UR driver"
            ),
        ),
        DeclareLaunchArgument(
            "ur_type",
            default_value="ur5e",
            description="Type of UR robot (ur3, ur5, ur5e, ur10, ur10e)",
        ),
        DeclareLaunchArgument(
            "robot_id",
            default_value="arm-ur5",
            description="Unique robotic identifier for DataFabric topics and sessions",
        ),
        DeclareLaunchArgument(
            "robot_ip",
            default_value="192.168.1.100",
            description="IP address of physical Universal Robot",
        ),
        DeclareLaunchArgument(
            "use_virtual_plc",
            default_value="true",
            description="Start the SIM cell controller (virtual_plc); ignored when use_fake_hardware=false",
        ),
        DeclareLaunchArgument(
            "controller_host",
            default_value="127.0.0.1",
            description="Cell controller Modbus TCP host (virtual_plc bind address in SIM)",
        ),
        DeclareLaunchArgument(
            "controller_port",
            default_value="5020",
            description="Cell controller Modbus TCP port",
        ),
        DeclareLaunchArgument(
            "sim_time_scale",
            default_value="1.0",
            description="SIM only: virtual_plc simulated seconds per wall second (tests run decks fast)",
        ),
        DeclareLaunchArgument(
            "device_poll_hz",
            default_value="5.0",
            description="Cell device nodes poll the controller at this rate (pipeline-rates: 5 Hz)",
        ),
        DeclareLaunchArgument(
            "arm_step_duration",
            default_value="0.5",
            description="arm_controller seconds per PickAndPlace waypoint",
        ),
        DeclareLaunchArgument(
            "controllers_file",
            default_value=default_controllers,
            description="Path to controller configurations YAML file",
        ),
    ]

    return LaunchDescription(declared_arguments + [OpaqueFunction(function=launch_setup)])
