"""virtual_plc launch wiring: started only in SIM, pointed at the controller host/port."""

import importlib.util
import os

import pytest
from launch import LaunchContext
from launch.utilities import perform_substitutions
from launch_ros.actions import Node
from launch_ros.utilities import evaluate_parameters

_LAUNCH = os.path.join(os.path.dirname(__file__), "..", "launch", "robot_nodes.launch.py")


@pytest.fixture(scope="module")
def launch_module():
    spec = importlib.util.spec_from_file_location("robot_nodes_launch", _LAUNCH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _virtual_plc_nodes(module, **overrides):
    config = {
        "use_fake_hardware": "true",
        "ur_type": "ur5e",
        "robot_ip": "192.168.1.100",
        "controllers_file": "ur_controllers.yaml",
        "robot_id": "arm-ur5",
        "use_virtual_plc": "true",
        "controller_host": "127.0.0.1",
        "controller_port": "5020",
        "sim_time_scale": "1.0",
        "arm_step_duration": "0.5",
        "device_poll_hz": "5.0",
    }
    config.update(overrides)
    context = LaunchContext()
    context.launch_configurations.update(config)
    try:
        entities = module.launch_setup(context)
    except RuntimeError:
        # Physical mode needs ur_robot_driver, which is absent on a SIM-only host.
        return None
    return [e for e in entities if isinstance(e, Node) and e.node_executable == "virtual_plc"]


def test_sim_starts_virtual_plc(launch_module):
    assert len(_virtual_plc_nodes(launch_module)) == 1


def test_virtual_plc_can_be_switched_off_in_sim(launch_module):
    assert _virtual_plc_nodes(launch_module, use_virtual_plc="false") == []


def test_live_never_starts_virtual_plc(launch_module):
    nodes = _virtual_plc_nodes(launch_module, use_fake_hardware="false")
    assert not nodes  # None (no UR driver on host) or []


def test_launch_declares_controller_arguments(launch_module):
    names = {
        a.name
        for a in launch_module.generate_launch_description().entities
        if hasattr(a, "name") and hasattr(a, "default_value")
    }
    assert {"use_virtual_plc", "controller_host", "controller_port"} <= names


def _cell_nodes(module, **overrides):
    config = {
        "use_fake_hardware": "true",
        "ur_type": "ur5e",
        "robot_ip": "192.168.1.100",
        "controllers_file": "ur_controllers.yaml",
        "robot_id": "arm-ur5",
        "use_virtual_plc": "true",
        "controller_host": "10.0.0.7",
        "controller_port": "502",
        "sim_time_scale": "1.0",
        "arm_step_duration": "0.5",
        "device_poll_hz": "5.0",
    }
    config.update(overrides)
    context = LaunchContext()
    context.launch_configurations.update(config)
    entities = module.launch_setup(context)
    cell = ("conveyor_node", "flexfeeder_node", "station_node", "cell_orchestrator")
    return [e for e in entities if isinstance(e, Node) and e.node_executable in cell], context


def _params(node, context):
    """launch_ros keeps parameters as substitutions until the action executes."""
    merged = {}
    for p in evaluate_parameters(context, node._Node__parameters):
        merged.update(p)
    return merged


def _name(node, context):
    name = node._Node__node_name  # a plain str, or substitutions until the action executes
    return name if isinstance(name, str) else perform_substitutions(context, name)


def test_sim_launches_the_whole_cell_graph(launch_module):
    nodes, context = _cell_nodes(launch_module)
    names = sorted(_name(n, context) for n in nodes)
    assert names == sorted(
        [
            "conveyor",
            "flexfeeder",
            "station_white",
            "station_green",
            "station_blue",
            "station_scrap",
            "cell_orchestrator",
        ]
    )


@pytest.mark.parametrize("use_virtual_plc", ["true", "false"])
def test_device_nodes_connect_to_the_controller_host_and_port(launch_module, use_virtual_plc):
    nodes, context = _cell_nodes(launch_module, use_virtual_plc=use_virtual_plc)
    devices = [n for n in nodes if n.node_executable != "cell_orchestrator"]
    assert len(devices) == 6
    for node in devices:
        params = _params(node, context)
        assert (params["host"], params["port"]) == ("10.0.0.7", 502)
    stations = {
        _params(n, context)["station"] for n in devices if n.node_executable == "station_node"
    }
    assert stations == {"white", "green", "blue", "scrap"}
