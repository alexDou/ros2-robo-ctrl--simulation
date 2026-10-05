"""CellOrchestratorNode against a fake conveyor device (ConveyorRun action + ConveyorStop)."""

import json
import threading
import time

import pytest
import rclpy
from cell_orchestrator.orchestrator_node import CellOrchestratorNode
from geometry_msgs.msg import Point
from rclpy.action import ActionServer, CancelResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.action import ConveyorRun, PickAndPlace
from robot_control_interfaces.srv import (
    CellFill,
    CellProcess,
    CellStop,
    CommitDrop,
    ConveyorStop,
    FeederEnable,
    FeederFill,
    GetDropSlot,
    MarkGrasped,
    RegisterGear,
)
from std_msgs.msg import String

from domain import CellState, ConveyorStatus

TIMEOUT = 5.0


class FakeConveyor:
    """Holds each ConveyorRun goal open until released, like the real device does."""

    def __init__(self, node, log: list[str]) -> None:
        self.log = log
        self.goals: list[int] = []
        self.stop_calls = 0
        self.release = threading.Event()
        self.running = 0  # goals currently inside _execute
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
        mode = goal_handle.request.mode
        self.goals.append(mode)
        self.log.append("belt:FLUSH" if mode == ConveyorRun.Goal.FLUSH else "belt:RUN")
        self.running += 1
        try:
            while not self.release.wait(0.01):
                if goal_handle.is_cancel_requested:
                    goal_handle.canceled()
                    return ConveyorRun.Result(stop_reason="STOPPED")
            self.release.clear()  # one release completes one goal
            reason = self.stop_reason
            if mode == ConveyorRun.Goal.FLUSH and reason == "STOPPED_AT_EYE":
                reason = "FLUSH_DONE"
            result = ConveyorRun.Result(success=self.success, stop_reason=reason)
            (goal_handle.succeed if self.success else goal_handle.abort)()
            return result
        finally:
            self.running -= 1

    def _stop(self, _req, res):
        self.stop_calls += 1
        self.stop_reason, self.success = "STOPPED", False
        self.release.set()
        res.success = True
        return res

    def publish_encoder(self, mm: float, gears: list[dict] | None = None) -> None:
        status = {"state": "RUNNING", "encoder_mm": mm, "exit_count_total": 0, "gears": gears or []}
        self.status_pub.publish(String(data=json.dumps(status)))


class FakeArm:
    """Stands in for arm_controller's PickAndPlace server; one goal at a time is a test invariant."""

    def __init__(self, node, log: list[str]) -> None:
        self.log = log
        self.goals: list[PickAndPlace.Goal] = []
        self.hold = threading.Event()  # set -> goals wait for `release`
        self.release = threading.Event()
        self.success = True
        self.running = 0
        self.max_running = 0
        self.action = ActionServer(
            node,
            PickAndPlace,
            "arm_controller/pick_and_place",
            execute_callback=self._execute,
            cancel_callback=lambda _: CancelResponse.ACCEPT,
            callback_group=ReentrantCallbackGroup(),
        )

    def _execute(self, goal_handle):
        self.running += 1
        self.max_running = max(self.max_running, self.running)
        try:
            req = goal_handle.request
            self.goals.append(req)
            self.log.append("arm")
            for phase in ("GRASPING", "RELEASING"):
                goal_handle.publish_feedback(PickAndPlace.Feedback(phase=phase))
                time.sleep(0.05)
            while self.hold.is_set() and not self.release.wait(0.01):
                pass
            self.release.clear()
            self.log.append("home")
            (goal_handle.succeed if self.success else goal_handle.abort)()
            return PickAndPlace.Result(success=self.success)
        finally:
            self.running -= 1


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


class FakeWorkcell:
    """Stands in for WorkcellNode: records every registration, like a stopped belt's Batch."""

    def __init__(self, node, log: list[str]) -> None:
        self.log = log
        self.registered: list[tuple[str, float, float, str, bool]] = []
        self.ok = True
        group = ReentrantCallbackGroup()
        node.create_service(
            RegisterGear, "workcell/register_gear", self._register, callback_group=group
        )
        node.create_service(
            GetDropSlot, "workcell/get_drop_slot", self._drop_slot, callback_group=group
        )
        node.create_service(MarkGrasped, "workcell/mark_grasped", self._mark, callback_group=group)
        node.create_service(CommitDrop, "workcell/commit_drop", self._commit, callback_group=group)

    def _drop_slot(self, req, res):
        self.log.append(f"slot:{req.color}")
        res.slot_index = 0
        res.drop_coords = Point(x=-0.45, y={"WHITE": -0.26, "GREEN": -0.1, "BLUE": 0.06}[req.color])
        return res

    def _mark(self, _req, res):
        self.log.append("mark")
        res.success = True
        return res

    def _commit(self, _req, res):
        self.log.append("commit")
        res.success = True
        return res

    def _register(self, req, res):
        self.registered.append((req.id, req.coords.x, req.coords.y, req.color, req.intact))
        res.success = self.ok
        return res


@pytest.fixture
def cell():
    rclpy.init()
    node = CellOrchestratorNode()
    fake_node = rclpy.create_node("fake_conveyor")
    client = rclpy.create_node("orchestrator_test_client")
    log: list[str] = []
    fake = FakeConveyor(fake_node, log)
    fake.log = log
    fake.feeder = FakeFeeder(fake_node)
    fake.workcell = FakeWorkcell(fake_node, log)
    fake.arm = FakeArm(fake_node, log)
    fake.arm.hold.set()  # a SortCycle stays in flight until a test releases the arm
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
    spinner = threading.Thread(target=executor.spin, daemon=True)
    spinner.start()
    assert process.wait_for_service(timeout_sec=TIMEOUT)
    assert stop.wait_for_service(timeout_sec=TIMEOUT)
    assert fake.fill.wait_for_service(timeout_sec=TIMEOUT)
    assert _wait(node._run_client.server_is_ready)  # discovery of the fake device
    assert _wait(node._feeder_fill_client.service_is_ready)
    assert _wait(node._arm_client.server_is_ready)
    yield fake, states, process, stop
    with node._lock:
        node._run_id += 1  # no further run or SortCycle may start
    fake.arm.hold.clear()
    fake.release.set()
    assert _wait(lambda: fake.running == 0 and fake.arm.running == 0)  # goals end before nodes die
    time.sleep(0.3)  # the executor still publishes the goal result after _execute returns
    executor.shutdown()
    spinner.join(timeout=TIMEOUT)  # no callback may run on a destroyed node
    for n in (node, fake_node, client):
        n.destroy_node()  # the orchestrator joins its SortCycle worker
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
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)
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
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)
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


def _belt_gear(gear_id, y, intact=True, color="GREEN", x=0.41):
    return {"id": gear_id, "x": x, "y": y, "color": color, "intact": intact}


def _run_to_eye(fake, states, process, gears):
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, gears)
    assert _wait(lambda: states[-1].belt_gears and len(states[-1].belt_gears) == len(gears))
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.HALTED)


def test_eye_stop_registers_the_batch_lead_first(cell):
    fake, states, process, _ = cell
    gears = [
        _belt_gear("belt-3", 0.0),
        _belt_gear("belt-1", -0.4, intact=False, color="BLUE"),
        _belt_gear("belt-2", -0.2),
        _belt_gear("belt-0", 0.8),  # upstream of the PickZone: not part of this Batch
    ]

    _run_to_eye(fake, states, process, gears)

    assert fake.workcell.registered == [
        ("belt-1", 0.41, -0.4, "BLUE", False),
        ("belt-2", 0.41, -0.2, "GREEN", True),
        ("belt-3", 0.41, 0.0, "GREEN", True),
    ]
    assert fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE]  # registering moves no arm


def test_nothing_is_registered_before_the_eye_stop(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(300.0, [_belt_gear("belt-1", 0.0)])
    time.sleep(0.3)
    assert fake.workcell.registered == []


def test_failed_registration_faults_the_cell(cell):
    fake, states, process, _ = cell
    fake.workcell.ok = False
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)


def _sorted_batch(fake, states, process, gears, remaining=100):
    """Fill, feed run to the eye with `gears` on the belt, then let the arm sort freely."""
    _fill(fake, states)
    fake.feeder.publish(remaining)
    assert _wait(lambda: states[-1].feeder_remaining == remaining)
    fake.arm.hold.clear()
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, gears)
    assert _wait(lambda: len(states[-1].belt_gears) == len(gears))
    fake.release.set()


MIXED_BATCH = [
    _belt_gear("belt-3", 0.0, color="BLUE"),
    _belt_gear("belt-1", -0.4, color="GREEN"),
    _belt_gear("belt-4", -0.3, intact=False, color="WHITE"),
    _belt_gear("belt-2", -0.2, color="WHITE"),
]


def test_sortcycles_run_in_belt_order_one_at_a_time(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: len(fake.goals) == 2 and len(fake.arm.goals) == 3)
    picks = [(g.pick_coords.x, g.pick_coords.y, g.pick_coords.z) for g in fake.arm.goals]
    assert picks == [(0.41, -0.4, 0.0), (0.41, -0.2, 0.0), (0.41, 0.0, 0.0)]  # Rejected stays
    drops = [(g.drop_coords.y, g.use_custom_drop) for g in fake.arm.goals]
    assert drops == [(-0.1, True), (-0.26, True), (0.06, True)]  # each colour's PalletStation
    assert fake.arm.max_running == 1


def test_each_sortcycle_commits_its_drop_before_the_next_begins(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: fake.log.count("home") == 3)
    cycle = ["slot:GREEN", "arm", "mark", "commit", "home"]
    assert fake.log[fake.log.index("slot:GREEN") :][: len(cycle)] == cycle
    assert [e for e in fake.log if e.startswith("slot:")] == [
        "slot:GREEN",
        "slot:WHITE",
        "slot:BLUE",
    ]
    arm_events = [e for e in fake.log if e in ("arm", "home")]
    assert arm_events == ["arm", "home"] * 3


def test_batch_done_sends_the_next_feed_run_after_the_arm_is_home(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE] * 2)
    assert fake.log[fake.log.index("belt:RUN", 1) - 1] == "home"
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FEEDING)


def test_sorted_gearwheels_leave_the_belt_view(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: len(fake.goals) == 2)
    fake.publish_encoder(520.0, MIXED_BATCH)
    assert _wait(lambda: [g.id for g in states[-1].belt_gears] == ["belt-4"])


def test_end_of_deck_runs_the_final_flush_then_empty(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH, remaining=0)

    assert _wait(lambda: fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE, ConveyorRun.Goal.FLUSH])
    assert fake.log.index("belt:FLUSH") > max(i for i, e in enumerate(fake.log) if e == "home")
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.EMPTY)


def test_gearwheels_waiting_upstream_keep_the_feed_run_going(cell):
    fake, states, process, _ = cell
    waiting = [*MIXED_BATCH, _belt_gear("belt-9", 0.8)]  # upstream of the PickZone

    _sorted_batch(fake, states, process, waiting, remaining=0)

    assert _wait(lambda: fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE] * 2)


def test_stop_lets_the_in_flight_sortcycle_finish_and_process_resumes_sorting(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, MIXED_BATCH)
    assert _wait(lambda: len(states[-1].belt_gears) == len(MIXED_BATCH))
    fake.release.set()
    assert _wait(lambda: len(fake.arm.goals) == 1)  # first SortCycle in flight, arm held

    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)
    fake.arm.release.set()
    assert _wait(lambda: fake.log.count("home") == 1)
    time.sleep(0.3)
    assert len(fake.arm.goals) == 1  # no new cycle after Stop

    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.arm.goals) == 2)  # resumes the Batch, not a belt run
    assert fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE]
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.HALTED)


def test_failed_pickandplace_faults_the_cell(cell):
    fake, states, process, _ = cell
    fake.arm.success = False

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    time.sleep(0.2)
    assert len(fake.arm.goals) == 1
