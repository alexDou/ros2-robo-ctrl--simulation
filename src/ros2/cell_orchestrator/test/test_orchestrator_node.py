"""CellOrchestratorNode against a fake conveyor device (ConveyorRun action + ConveyorStop)."""

import json
import threading
import time

import pytest
import rclpy
from cell_orchestrator.orchestrator_node import CellOrchestratorNode
from rclpy.action import ActionServer, CancelResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.action import ConveyorRun
from robot_control_interfaces.srv import (
    CellFill,
    CellProcess,
    CellStop,
    ConveyorStop,
    FeederEnable,
    FeederFill,
)
from std_msgs.msg import String

from domain import CellState, ConveyorStatus

TIMEOUT = 5.0


class FakeConveyor:
    """Holds each ConveyorRun goal open until released, like the real device does."""

    def __init__(self, node) -> None:
        self.goals: list[int] = []
        self.stop_calls = 0
        self.release = threading.Event()
        self.stop_reason = "STOPPED_AT_EYE"
        self.success = True
        group = ReentrantCallbackGroup()
        self.action = ActionServer(
            node,
            ConveyorRun,
            "conveyor/run",
            execute_callback=self._execute,
            cancel_callback=lambda _: CancelResponse.ACCEPT,
            callback_group=group,
        )
        node.create_service(ConveyorStop, "conveyor/stop", self._stop, callback_group=group)
        self.status_pub = node.create_publisher(String, "conveyor/status", 10)

    def _execute(self, goal_handle):
        self.goals.append(goal_handle.request.mode)
        while not self.release.wait(0.01):
            if goal_handle.is_cancel_requested:
                goal_handle.canceled()
                return ConveyorRun.Result(stop_reason="STOPPED")
        result = ConveyorRun.Result(success=self.success, stop_reason=self.stop_reason)
        (goal_handle.succeed if self.success else goal_handle.abort)()
        return result

    def _stop(self, _req, res):
        self.stop_calls += 1
        self.stop_reason, self.success = "STOPPED", False
        self.release.set()
        res.success = True
        return res

    def publish_encoder(self, mm: float, gears: list[dict] | None = None) -> None:
        status = {"state": "RUNNING", "encoder_mm": mm, "exit_count_total": 0, "gears": gears or []}
        self.status_pub.publish(String(data=json.dumps(status)))


class FakeFeeder:
    """Stands in for the FlexFeeder device node: services in, feeder/status out."""

    def __init__(self, node) -> None:
        self.fills: list[int] = []
        self.enables: list[bool] = []
        self.fill_ok = True
        group = ReentrantCallbackGroup()
        node.create_service(FeederFill, "feeder/fill", self._fill, callback_group=group)
        node.create_service(FeederEnable, "feeder/enable", self._enable, callback_group=group)
        self.status_pub = node.create_publisher(String, "feeder/status", 10)

    def _fill(self, req, res):
        self.fills.append(req.seed)
        res.success = self.fill_ok
        if self.fill_ok:
            self.publish(100, "READY")
        return res

    def _enable(self, req, res):
        self.enables.append(req.enable)
        res.success = True
        return res

    def publish(self, remaining: int, state: str = "PLACING") -> None:
        self.status_pub.publish(String(data=json.dumps({"state": state, "remaining": remaining})))


@pytest.fixture
def cell():
    rclpy.init()
    node = CellOrchestratorNode()
    fake_node = rclpy.create_node("fake_conveyor")
    client = rclpy.create_node("orchestrator_test_client")
    fake = FakeConveyor(fake_node)
    fake.feeder = FakeFeeder(fake_node)
    fake.fill = client.create_client(CellFill, "cell/fill")
    states: list[CellState] = []
    client.create_subscription(
        String,
        "cell/state",
        lambda m: states.append(CellState.model_validate_json(m.data)),
        QoSProfile(
            depth=10,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
        ),
    )
    process = client.create_client(CellProcess, "cell/process")
    stop = client.create_client(CellStop, "cell/stop")
    executor = MultiThreadedExecutor(num_threads=6)
    for n in (node, fake_node, client):
        executor.add_node(n)
    threading.Thread(target=executor.spin, daemon=True).start()
    assert process.wait_for_service(timeout_sec=TIMEOUT)
    assert stop.wait_for_service(timeout_sec=TIMEOUT)
    assert fake.fill.wait_for_service(timeout_sec=TIMEOUT)
    assert _wait(node._run_client.server_is_ready)  # discovery of the fake device
    assert _wait(node._feeder_fill_client.service_is_ready)
    yield fake, states, process, stop
    fake.release.set()
    executor.shutdown()
    for n in (node, fake_node, client):
        n.destroy_node()
    rclpy.shutdown()


def _wait(pred, timeout=TIMEOUT):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.01)
    return False


def _call(client, request):
    done = threading.Event()
    future = client.call_async(request)
    future.add_done_callback(lambda _: done.set())
    assert done.wait(TIMEOUT)
    return future.result()


def _fill(fake, states):
    """Fill the fake feeder so Process is allowed (LOADED)."""
    assert _call(fake.fill, CellFill.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.LOADED)


def _statuses(states):
    return [s.conveyor_status for s in states]


def test_publishes_initial_empty_state_on_request(cell):
    _, states, _, _ = cell
    assert _wait(lambda: ConveyorStatus.EMPTY in _statuses(states))


def test_process_runs_belt_then_halts_at_eye(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: ConveyorStatus.FEEDING in _statuses(states))
    assert fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE]
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.HALTED)


def test_process_is_refused_while_feeding(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    second = _call(process, CellProcess.Request())
    assert not second.success
    assert "FEEDING" in second.message


def test_stop_while_feeding_freezes_belt_and_ends_stopped(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: fake.stop_calls == 1)
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)
    # the aborted ConveyorRun goal must not overwrite STOPPED
    time.sleep(0.3)
    assert states[-1].conveyor_status == ConveyorStatus.STOPPED


def test_process_resumes_from_stopped(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)
    fake.release.clear()
    fake.stop_reason, fake.success = "STOPPED_AT_EYE", True
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 2)
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.HALTED)


def test_stop_is_refused_when_nothing_runs(cell):
    _, _, _, stop = cell
    res = _call(stop, CellStop.Request())
    assert not res.success
    assert "EMPTY" in res.message


def test_device_fault_sets_fault_status(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    fake.stop_reason, fake.success = "FAULT", False
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)


def test_belt_offset_follows_encoder_at_5hz_while_moving(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    before = len(states)
    for mm in (100.0, 200.0, 300.0, 400.0):
        fake.publish_encoder(mm)
        time.sleep(0.05)
    assert _wait(lambda: states[-1].belt_offset_m == pytest.approx(0.4))
    # throttled: far fewer publishes than encoder updates would imply at 20 Hz
    assert len(states) - before <= 4


def test_fill_loads_the_feeder_and_reports_remaining(cell):
    fake, states, _, _ = cell
    assert _wait(lambda: states and states[-1].feeder_remaining == 0)

    assert _call(fake.fill, CellFill.Request()).success

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.LOADED)
    assert _wait(lambda: states[-1].feeder_remaining == 100)
    assert len(fake.feeder.fills) == 1


def test_fill_is_refused_unless_empty(cell):
    fake, states, process, _ = cell
    _fill(fake, states)

    again = _call(fake.fill, CellFill.Request())
    assert not again.success
    assert "LOADED" in again.message
    assert len(fake.feeder.fills) == 1

    assert _call(process, CellProcess.Request()).success
    assert not _call(fake.fill, CellFill.Request()).success


def test_failed_feeder_fill_leaves_the_cell_empty(cell):
    fake, states, _, _ = cell
    fake.feeder.fill_ok = False

    res = _call(fake.fill, CellFill.Request())

    assert not res.success
    time.sleep(0.2)
    assert states[-1].conveyor_status == ConveyorStatus.EMPTY


def test_process_is_refused_until_filled(cell):
    _, _, process, _ = cell
    res = _call(process, CellProcess.Request())
    assert not res.success
    assert "EMPTY" in res.message


def test_process_enables_the_feeder_and_stop_disables_it(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: fake.feeder.enables == [True])

    assert _call(stop, CellStop.Request()).success

    assert _wait(lambda: fake.feeder.enables == [True, False])


def test_feeder_remaining_follows_feeder_status(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success

    fake.feeder.publish(87)

    assert _wait(lambda: states[-1].feeder_remaining == 87)


def test_belt_gears_follow_the_conveyor_tracking(cell):
    fake, states, _, _ = cell
    gear = {"id": "belt-1", "x": 0.41, "y": 0.5, "color": "BLUE", "intact": False}

    def republished(gears, expected):
        fake.publish_encoder(100.0, gears)  # a first message can precede subscription matching
        return bool(states) and [g.model_dump() for g in states[-1].belt_gears] == expected

    assert _wait(lambda: republished([gear], [gear]))
    assert _wait(lambda: republished([], []))
