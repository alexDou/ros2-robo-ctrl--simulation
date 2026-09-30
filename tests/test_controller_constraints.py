"""Trajectory-controller tolerance policy: SIM vs LIVE (hand-sim-pabi).

On the 5 Hz GenericSystem mock the state mirrors the last command, so the
path error only measures loop jitter: one overrun (a ~250 ms loop, 2 missed
cycles) during a 2 rad/s swing reads as 0.3-0.7 rad of "error" and aborts the
PickAndPlace. SIM therefore disables the path check and keeps the goal check;
LIVE keeps both, because a real arm can deviate.
"""

from pathlib import Path

import pytest
import yaml

from domain import UR5E_JOINTS as JOINTS

CONFIG_DIR = Path(__file__).resolve().parents[1] / "src" / "ros2" / "robot_bringup" / "config"


def _constraints(filename: str) -> dict:
    config = yaml.safe_load((CONFIG_DIR / filename).read_text())
    return config["scaled_joint_trajectory_controller"]["ros__parameters"]["constraints"]


@pytest.mark.parametrize("joint", JOINTS)
def test_sim_disables_path_tolerance_on_mock_hardware(joint):
    # 0.0 disables the JTC path check for that joint.
    assert _constraints("ur_controllers.yaml")[joint]["trajectory"] == 0.0


@pytest.mark.parametrize("joint", JOINTS)
def test_sim_keeps_goal_tolerance(joint):
    assert _constraints("ur_controllers.yaml")[joint]["goal"] == 0.1


@pytest.mark.parametrize("joint", JOINTS)
def test_live_keeps_path_and_goal_tolerance(joint):
    live = _constraints("ur_controllers_real.yaml")[joint]
    assert live["trajectory"] == 0.2
    assert live["goal"] == 0.1
