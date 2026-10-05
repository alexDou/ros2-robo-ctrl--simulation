"""STANDBY vs a goal whose acceptance reaches the client late (deterministic, no timing)."""

import threading
import time
from unittest.mock import MagicMock

import pytest
from arm_controller.edge_bridge_node import EdgeBridgeNode
from control_msgs.action import FollowJointTrajectory
from rclpy.parameter import Parameter
from rclpy.task import Future
from robot_control_interfaces.action import PickAndPlace

from domain import CANONICAL_POSES, PickAndPlaceTargetPayload, PoseName, RobotState


class FakeGoalHandle:
    accepted = True

    def __init__(self, result) -> None:
        self.cancel_goal_async = MagicMock()
        self._result = result

    def get_result_async(self) -> Future:
        future = Future()
        wrapper = MagicMock()
        wrapper.result = self._result
        future.set_result(wrapper)
        return future


class FakeClient:
    """send_goal_async hands out futures the test resolves by hand, in any order."""

    def __init__(self) -> None:
        self.sent: list[Future] = []
        self.sent_event = threading.Event()

    def send_goal_async(self, goal, feedback_callback=None) -> Future:
        future = Future()
        self.sent.append(future)
        self.sent_event.set()
        return future

    def server_is_ready(self) -> bool:
        return True


@pytest.fixture
def node():
    n = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-standby-race"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("standby_park_timeout", Parameter.Type.DOUBLE, 5.0),
        ]
    )
    n._switch_controllers = lambda **_: True
    n._robot_state = RobotState.EXECUTING
    yield n
    n.close()
    n.destroy_node()


def _standby_in_thread(node) -> threading.Thread:
    thread = threading.Thread(target=node.handle_standby, daemon=True)
    thread.start()
    return thread


def test_late_accepted_trajectory_goal_is_cancelled_by_standby(node):
    client = FakeClient()
    node._traj_client = client
    node._dispatch_trajectory_points([list(CANONICAL_POSES[PoseName.READY])])
    old_goal = client.sent[0]  # sent, acceptance still in flight

    standby = _standby_in_thread(node)
    assert client.sent_event.wait(2.0) and _wait_for(lambda: len(client.sent) == 2)  # park sent

    old_handle = FakeGoalHandle(FollowJointTrajectory.Result())
    old_goal.set_result(old_handle)  # the interrupted goal is accepted only now

    old_handle.cancel_goal_async.assert_called_once()
    _finish_park(client.sent[1])
    standby.join(2.0)
    assert node.robot_state == RobotState.STANDBY


def test_late_accepted_pick_and_place_goal_is_cancelled_by_standby(node):
    pnp, traj = FakeClient(), FakeClient()
    node._pnp_client, node._traj_client = pnp, traj
    node._dispatch_pick_and_place_goal(
        PickAndPlaceTargetPayload(pick_x=0.4, pick_y=0.0, pick_z=0.0), command_id="c1"
    )
    old_goal = pnp.sent[0]  # sent, acceptance still in flight

    standby = _standby_in_thread(node)
    assert _wait_for(lambda: len(traj.sent) == 1)  # park sent: standby is past its snapshot

    old_handle = FakeGoalHandle(PickAndPlace.Result(success=True))
    old_goal.set_result(old_handle)

    old_handle.cancel_goal_async.assert_called_once()
    _finish_park(traj.sent[0])
    standby.join(2.0)
    assert node.robot_state == RobotState.STANDBY


def _finish_park(future: Future) -> None:
    result = FollowJointTrajectory.Result()
    result.error_code = FollowJointTrajectory.Result.SUCCESSFUL
    future.set_result(FakeGoalHandle(result))


def _wait_for(predicate, timeout: float = 2.0) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.005)
    return False
