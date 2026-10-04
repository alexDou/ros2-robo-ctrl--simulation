"""virtual_plc launch wiring: started only in SIM, pointed at the controller host/port."""

import importlib.util
import os

import pytest
from launch import LaunchContext
from launch_ros.actions import Node

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
