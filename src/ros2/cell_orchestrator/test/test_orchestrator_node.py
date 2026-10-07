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
from robot_control_interfaces.action import ConveyorRun, PickAndPlace, StationExchange
from robot_control_interfaces.srv import (
    CellFaultAck,
    CellFill,
    CellProcess,
    CellReset,
    CellStop,
    ClearWorkspace,
    CommitDrop,
    ConveyorFinish,
    ConveyorFreeze,
    ConveyorStop,
    FeederEnable,
    FeederFill,
    FeederQuickEmpty,
    GetDropSlot,
    MarkGrasped,
    RegisterGear,
    ResetStation,
    ScrapRejected,
)
from std_msgs.msg import String

from domain import BIN_EXCHANGE_THRESHOLD, PALLET_CAPACITY, CellState, ConveyorStatus

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
        self.exit_count_delta = 0  # what the exit eye reports for the next goal
        self.encoder_mm = 0.0  # a run ends where the belt was last published, unless set
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
        self.finishes = 0
        node.create_service(ConveyorFinish, "conveyor/finish", self._finish, callback_group=group)
        self.freezes: list[bool] = []
        node.create_service(ConveyorFreeze, "conveyor/freeze", self._freeze, callback_group=group)
        self.fault_acks = 0
        self.fault_ack_ok = True
        node.create_service(CellFaultAck, "cell/fault_ack", self._fault_ack, callback_group=group)
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
            result = ConveyorRun.Result(
                success=self.success,
                stop_reason=reason,
                exit_count_delta=self.exit_count_delta,
                encoder_mm=self.encoder_mm,
            )
            self.exit_count_delta = 0
            (goal_handle.succeed if self.success else goal_handle.abort)()
            return result
        finally:
            self.running -= 1

    def frozen(self) -> bool:
        return bool(self.freezes) and self.freezes[-1]

    def _fault_ack(self, _req, res):
        self.fault_acks += 1
        self.log.append("fault_ack")
        res.success = self.fault_ack_ok
        return res

    def _freeze(self, req, res):
        self.freezes.append(req.freeze)
        res.success = True
        return res

    def _finish(self, _req, res):
        """Stop (D30): the run goes on until a test releases it at the eye."""
        self.finishes += 1
        res.success = True
        return res

    def _stop(self, _req, res):
        self.stop_calls += 1
        self.stop_reason, self.success = "STOPPED", False
        self.release.set()
        res.success = True
        return res

    def publish_encoder(
        self, mm: float, gears: list[dict] | None = None, belt_fault: int = 0, **interlocks: bool
    ) -> None:
        ok = {"bin_home": True, "feeder_ok": True, "drives_ok": True, "estop_chain_ok": True}
        self.encoder_mm = mm
        status = {
            "state": "FAULT" if belt_fault else "RUNNING",
            "encoder_mm": mm,
            "exit_count_total": 0,
            "belt_fault": belt_fault,
            "interlocks": {**ok, **interlocks},
            "gears": gears or [],
        }
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
        self.cancelled = 0
        self.hold_at_grasp = threading.Event()  # set -> wait in the DexterousPalm before RELEASING
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
            for phase in ("RELEASING",) if req.place_only else ("GRASPING", "RELEASING"):
                if phase == "RELEASING" and self.hold_at_grasp.is_set():
                    while not self.release.wait(0.01):
                        if goal_handle.is_cancel_requested:  # frozen mid-air, Gearwheel held
                            self.cancelled += 1
                            self.log.append("arm_stopped")
                            goal_handle.canceled()
                            return PickAndPlace.Result(success=False)
                    self.release.clear()
                goal_handle.publish_feedback(PickAndPlace.Feedback(phase=phase))
                time.sleep(0.05)
            while self.hold.is_set() and not self.release.wait(0.01):
                if goal_handle.is_cancel_requested:  # safe stop in place, nothing dropped
                    self.cancelled += 1
                    self.log.append("arm_stopped")
                    goal_handle.canceled()
                    return PickAndPlace.Result(success=False)
            self.release.clear()
            self.log.append("home")
            (goal_handle.succeed if self.success else goal_handle.abort)()
            return PickAndPlace.Result(success=self.success)
        finally:
            self.running -= 1


class FakeStations:
    """Stands in for the three PalletStation and the ScrapBin device nodes: an exchange is held until released."""

    def __init__(self, node, log: list[str], frozen=lambda: False) -> None:
        self.log = log
        self.frozen = frozen  # a FREEZE holds every exchange where it is
        self.hold = threading.Event()  # set -> exchanges wait for `release`
        self.release = threading.Event()
        self.success = True
        self.running = 0
        self.actions = [
            ActionServer(
                node,
                StationExchange,
                f"station/{name.lower()}/exchange",
                execute_callback=lambda gh, name=name: self._execute(gh, name),
                cancel_callback=lambda _: CancelResponse.REJECT,
                callback_group=ReentrantCallbackGroup(),
            )
            for name in ("WHITE", "GREEN", "BLUE", "SCRAP")
        ]

    def _execute(self, goal_handle, name: str):
        self.running += 1
        try:
            self.log.append(f"exchange:{name}")
            goal_handle.publish_feedback(StationExchange.Feedback(exchange_state="LEAVING"))
            while self.hold.is_set() and not self.release.wait(0.01):
                pass
            self.release.clear()
            while self.frozen():
                time.sleep(0.01)
            for state in ("AWAY", "RETURNING"):
                goal_handle.publish_feedback(StationExchange.Feedback(exchange_state=state))
                time.sleep(0.02)
            self.log.append(f"exchange_done:{name}")
            if self.success:
                goal_handle.succeed()
                return StationExchange.Result(success=True, final_state="HOME")
            goal_handle.abort()
            return StationExchange.Result(success=False, final_state="FAULT", fault=1)
        finally:
            self.running -= 1


class FakeFeeder:
    """Stands in for the FlexFeeder device node: services in, feeder/status out."""

    def __init__(self, node) -> None:
        self.fills: list[int] = []
        self.enables: list[bool] = []
        self.quick_empties = 0
        self.fill_ok = True
        group = ReentrantCallbackGroup()
        node.create_service(FeederFill, "feeder/fill", self._fill, callback_group=group)
        node.create_service(FeederEnable, "feeder/enable", self._enable, callback_group=group)
        node.create_service(
            FeederQuickEmpty, "feeder/quick_empty", self._quick_empty, callback_group=group
        )
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

    def _quick_empty(self, _req, res):
        self.quick_empties += 1
        self.publish(0, "EMPTY")
        res.success = True
        return res

    def publish(self, remaining: int, state: str = "PLACING", fault: int = 0) -> None:
        status = {"state": state, "remaining": remaining, "fault": fault}
        self.status_pub.publish(String(data=json.dumps(status)))


class FakeWorkcell:
    """Stands in for WorkcellNode: records every registration, like a stopped belt's Batch."""

    def __init__(self, node, log: list[str]) -> None:
        self.log = log
        self.registered: list[tuple[str, float, float, str, bool]] = []
        self.scrap_counts: list[int] = []
        self.scrap_ok = True
        self.ok = True
        self.full_colors: set[str] = set()  # a commit for these colours fills the Pallet
        self.resets: list[str] = []
        self.reset_ok = True
        self.clears = 0
        self._last_color = ""
        self.pallets: dict[str, int] = {}
        group = ReentrantCallbackGroup()
        node.create_service(
            RegisterGear, "workcell/register_gear", self._register, callback_group=group
        )
        node.create_service(
            GetDropSlot, "workcell/get_drop_slot", self._drop_slot, callback_group=group
        )
        node.create_service(
            ScrapRejected, "workcell/scrap_rejected", self._scrap, callback_group=group
        )
        node.create_service(MarkGrasped, "workcell/mark_grasped", self._mark, callback_group=group)
        node.create_service(CommitDrop, "workcell/commit_drop", self._commit, callback_group=group)
        node.create_service(
            ResetStation, "workcell/reset_station", self._reset, callback_group=group
        )
        node.create_service(
            ClearWorkspace, "workcell/clear_workspace", self._clear, callback_group=group
        )

    def _clear(self, _req, res):
        self.log.append("clear")
        self.clears += 1
        self.pallets.clear()
        res.success = True
        return res

    def _reset(self, req, res):
        self.log.append(f"reset:{req.station}")
        self.resets.append(req.station)
        if self.reset_ok:
            self.pallets.pop(req.station, None)
        res.success = self.reset_ok
        return res

    def _drop_slot(self, req, res):
        self._last_color = req.color
        self.log.append(f"slot:{req.color}")
        res.slot_index = 0
        res.drop_coords = Point(x=-0.45, y={"WHITE": -0.26, "GREEN": -0.1, "BLUE": 0.06}[req.color])
        return res

    def _scrap(self, req, res):
        self.log.append("scrap")
        self.scrap_counts.append(req.count)
        res.success = self.scrap_ok
        res.scrapped = req.count
        return res

    def _mark(self, _req, res):
        self.log.append("mark")
        res.success = True
        return res

    def _commit(self, _req, res):
        self.log.append("commit")
        res.success = True
        if self._last_color in self.full_colors:
            res.slot_index, res.overflow_occurred = PALLET_CAPACITY - 1, True
        else:
            res.slot_index = self.pallets.get(self._last_color, 0)
        self.pallets[self._last_color] = res.slot_index + 1
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
    fake.faults = []
    client.create_subscription(
        String, "cell/fault", lambda m: fake.faults.append(json.loads(m.data)), 10
    )
    fake.stations = FakeStations(fake_node, log, frozen=fake.frozen)
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
    fake.estop = client.create_client(CellStop, "cell/emergency_stop")
    fake.reset = client.create_client(CellReset, "cell/reset")
    executor = MultiThreadedExecutor(num_threads=6)
    for n in (node, fake_node, client):
        executor.add_node(n)
    spinner = threading.Thread(target=executor.spin, daemon=True)
    spinner.start()
    assert process.wait_for_service(timeout_sec=TIMEOUT)
    assert stop.wait_for_service(timeout_sec=TIMEOUT)
    assert fake.estop.wait_for_service(timeout_sec=TIMEOUT)
    assert fake.reset.wait_for_service(timeout_sec=TIMEOUT)
    assert fake.fill.wait_for_service(timeout_sec=TIMEOUT)
    assert _wait(node.ports.ready)  # discovery of the fake devices
    yield fake, states, process, stop
    assert node.cell.ask(node.cell.halt)[0]  # no further run or SortCycle may start
    fake.arm.hold.clear()
    fake.stations.hold.clear()
    fake.release.set()
    assert _wait(
        lambda: fake.running == 0 and fake.arm.running == 0 and fake.stations.running == 0
    )  # goals end before nodes die
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


def test_stop_while_feeding_lets_the_belt_reach_the_eye_and_sorts_nothing(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    fake.arm.hold.clear()
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)

    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)
    fake.release.set()  # the run goes on to the eye

    assert _wait(lambda: [r[0] for r in fake.workcell.registered] == ["belt-1"])
    time.sleep(0.3)
    assert (fake.stop_calls, fake.finishes) == (0, 1)
    assert fake.arm.goals == []  # registered, not sorted
    assert states[-1].conveyor_status == ConveyorStatus.STOPPED


def test_process_after_stop_sorts_the_batch_the_run_brought(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    fake.arm.hold.clear()
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)
    assert _call(stop, CellStop.Request()).success
    fake.release.set()
    assert _wait(lambda: fake.workcell.registered)

    assert _call(process, CellProcess.Request()).success

    assert _wait(lambda: len(fake.arm.goals) == 1)
    assert _wait(lambda: len(fake.goals) == 2)  # then the next feed run


def test_process_while_the_stopped_run_still_moves_keeps_feeding(cell):
    fake, states, process, stop = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    assert _call(stop, CellStop.Request()).success
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FEEDING)
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.0)])
    assert _wait(lambda: states[-1].belt_gears)

    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.HALTED)
    assert len(fake.goals) == 1  # the same run, not a second one


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
    assert _wait(lambda: fake.faults == [{"device": "conveyor", "code": "FAULT"}])
    assert fake.freezes == [True]


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


def test_a_defective_is_registered_rejected_as_soon_as_it_is_placed(cell):
    """D35: a defective never stops the belt, so it is Rejected on placement, not at a stop."""
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(300.0, [_belt_gear("belt-1", 0.6, intact=False, color="BLUE")])

    assert _wait(lambda: fake.workcell.registered == [("belt-1", 0.41, 0.6, "BLUE", False)])
    fake.publish_encoder(400.0, [_belt_gear("belt-1", 0.5, intact=False, color="BLUE")])
    time.sleep(0.3)
    assert len(fake.workcell.registered) == 1  # once only
    assert states[-1].conveyor_status == ConveyorStatus.FEEDING


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


@pytest.mark.parametrize("phase", ["feeding", "sorting"])
def test_emergency_stop_freezes_the_devices_and_faults_the_cell(cell, phase):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    if phase == "sorting":
        fake.publish_encoder(500.0, MIXED_BATCH)
        assert _wait(lambda: len(states[-1].belt_gears) == len(MIXED_BATCH))
        fake.release.set()
        assert _wait(lambda: len(fake.arm.goals) == 1)

    assert _call(fake.estop, CellStop.Request()).success
    assert fake.freezes == [True]
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    if phase == "sorting":  # D31: the arm stops where it is, it does not finish its cycle
        assert _wait(lambda: fake.arm.cancelled == 1)
        assert "home" not in fake.log
        assert fake.faults == []  # the cancelled cycle is no new fault

    fake.arm.release.set()  # the arm finishing late must not revive the cell
    time.sleep(0.3)
    assert states[-1].conveyor_status == ConveyorStatus.FAULT
    assert len(fake.arm.goals) <= 1  # no new SortCycle


def test_emergency_stop_works_in_any_state(cell):
    fake, states, _, _ = cell
    assert _call(fake.estop, CellStop.Request()).success
    assert fake.freezes == [True]
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)


def test_failed_pickandplace_faults_the_cell(cell):
    fake, states, process, _ = cell
    fake.arm.success = False

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    time.sleep(0.2)
    assert len(fake.arm.goals) == 1


def test_exit_count_on_the_next_run_scraps_that_many_rejected(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: len(fake.goals) == 2)
    assert fake.workcell.scrap_counts == []  # Rejected stays on the belt through its own stop
    fake.exit_count_delta = 1
    fake.release.set()

    assert _wait(lambda: fake.workcell.scrap_counts == [1])
    assert _wait(lambda: len(fake.goals) == 3)  # scrapping does not stop the cycle


def test_no_exit_count_means_no_scrap_call(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: len(fake.goals) == 2)
    fake.release.set()

    assert _wait(lambda: len(fake.goals) == 3)  # the run finished and the next one began
    assert fake.workcell.scrap_counts == []


def test_failed_scrap_faults_the_cell(cell):
    fake, states, process, _ = cell
    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: len(fake.goals) == 2)
    fake.workcell.scrap_ok = False
    fake.exit_count_delta = 1
    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)


def _station(states, name):
    return next(st for st in states[-1].stations if st.name == name)


def test_a_full_pallet_exchanges_then_resets_before_the_next_sortcycle(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: fake.log.count("home") == 3)
    log = fake.log
    first = ["commit", "home", "exchange:GREEN", "exchange_done:GREEN", "reset:GREEN", "slot:WHITE"]
    start = log.index("commit")
    assert [e for e in log[start:] if e in first][: len(first)] == first
    assert fake.workcell.resets == ["GREEN"]


def test_the_next_sortcycle_waits_while_the_pallet_is_away(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.hold.set()

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: "exchange:GREEN" in fake.log)
    time.sleep(0.3)
    assert "slot:WHITE" not in fake.log
    assert fake.workcell.resets == []
    assert _station(states, "GREEN").exchange_state.value == "LEAVING"

    fake.stations.release.set()
    assert _wait(lambda: "slot:WHITE" in fake.log)
    assert fake.log.index("reset:GREEN") < fake.log.index("slot:WHITE")
    assert _wait(lambda: _station(states, "GREEN").exchange_state.value == "HOME")


def test_a_pallet_below_capacity_never_exchanges(cell):
    fake, states, process, _ = cell

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE] * 2)
    assert not [e for e in fake.log if e.startswith(("exchange", "reset"))]


def test_a_failed_exchange_faults_the_cell_without_a_reset(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.success = False

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    time.sleep(0.2)
    assert fake.workcell.resets == []
    assert len(fake.arm.goals) == 1
    assert _station(states, "GREEN").exchange_state.value == "FAULT"
    assert _wait(lambda: fake.faults == [{"device": "station_green", "code": "EXCHANGE_FAULT_1"}])
    assert fake.freezes == [True]


def test_a_failed_reset_faults_the_cell(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.workcell.reset_ok = False

    _sorted_batch(fake, states, process, MIXED_BATCH)

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    time.sleep(0.2)
    assert len(fake.arm.goals) == 1


def test_stop_lets_the_pallet_exchange_finish_but_starts_no_new_sortcycle(cell):
    fake, states, process, stop = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.hold.set()
    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: "exchange:GREEN" in fake.log)

    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)
    fake.stations.release.set()

    assert _wait(lambda: fake.workcell.resets == ["GREEN"])
    time.sleep(0.3)
    assert len(fake.arm.goals) == 1
    assert states[-1].conveyor_status == ConveyorStatus.STOPPED


def test_station_counts_follow_the_device_results(cell):
    fake, states, process, _ = cell
    assert _wait(lambda: states)
    assert [st.name.value for st in states[-1].stations] == ["WHITE", "GREEN", "BLUE", "SCRAP"]

    _scrapped_batch(fake, states, process, 7)

    assert _wait(lambda: [st.count for st in states[-1].stations] == [1, 1, 1, 7])


def _scrapped_batch(fake, states, process, scrapped, gears=MIXED_BATCH):
    """The exit eye counts `scrapped` Gearwheels on the run that stops at the eye."""
    fake.exit_count_delta = scrapped
    _sorted_batch(fake, states, process, gears)


def test_bin_exchange_starts_at_the_belt_stop_and_overlaps_the_sortcycles(cell):
    fake, states, process, _ = cell
    fake.stations.hold.set()

    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)

    assert _wait(lambda: "exchange:SCRAP" in fake.log)
    assert _wait(lambda: len(fake.arm.goals) == 3)  # all three intact Gearwheels sorted meanwhile
    assert "exchange_done:SCRAP" not in fake.log
    assert fake.log.index("exchange:SCRAP") < fake.log.index("slot:BLUE")


def test_the_belt_is_held_while_the_bin_is_away(cell):
    fake, states, process, _ = cell
    fake.stations.hold.set()
    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)
    assert _wait(lambda: len(fake.arm.goals) == 3 and fake.log.count("home") == 3)

    time.sleep(0.3)
    assert len(fake.goals) == 1  # no next belt run while the bin is away

    fake.stations.release.set()
    assert _wait(lambda: len(fake.goals) == 2)
    assert fake.workcell.resets == ["SCRAP"]


def test_a_bin_below_the_threshold_never_exchanges(cell):
    fake, states, process, _ = cell

    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD - 1)

    assert _wait(lambda: len(fake.goals) == 2)
    assert not [e for e in fake.log if e.startswith(("exchange", "reset"))]


def test_pallet_and_bin_exchanges_may_overlap(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.hold.set()

    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)

    assert _wait(lambda: "exchange:GREEN" in fake.log and "exchange:SCRAP" in fake.log)
    assert not [e for e in fake.log if e.startswith("exchange_done")]

    def release_both() -> bool:
        fake.stations.release.set()
        return sorted(fake.workcell.resets) == ["GREEN", "SCRAP"]

    assert _wait(release_both)


def test_a_failed_bin_exchange_faults_the_cell_without_a_reset(cell):
    fake, states, process, _ = cell
    fake.stations.success = False

    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert _wait(lambda: fake.faults == [{"device": "station_scrap", "code": "EXCHANGE_FAULT_1"}])
    time.sleep(0.2)
    assert fake.workcell.resets == []
    assert len(fake.goals) == 1


def _reset_released(fake, states):
    """Lets the flush belt run finish once the reset has sent it; returns when the cell is EMPTY."""
    assert _wait(lambda: ConveyorRun.Goal.FLUSH in fake.goals)
    fake.release.set()
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.EMPTY)


def test_reset_from_mid_run_flushes_and_ends_empty_with_everything_home(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)

    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.RESETTING)
    _reset_released(fake, states)

    assert fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE, ConveyorRun.Goal.FLUSH]
    assert fake.feeder.quick_empties == 1
    assert fake.log.index("belt:FLUSH") < fake.log.index("clear")
    last = states[-1]
    assert [s.exchange_state.value for s in last.stations] == ["HOME"] * 4
    assert [s.count for s in last.stations] == [0, 0, 0, 0]
    assert last.belt_gears == []


def test_reset_from_fault_releases_the_freeze_and_ends_empty(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    assert _call(fake.estop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)

    assert fake.freezes == [True, False]
    assert fake.workcell.clears == 1


def test_reset_works_from_empty_on_connect(cell):
    fake, states, _, _ = cell

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)

    assert fake.workcell.clears == 1


def test_reset_is_refused_while_resetting(cell):
    fake, states, _, _ = cell
    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.RESETTING)

    again = _call(fake.reset, CellReset.Request())

    assert not again.success
    assert "RESETTING" in again.message
    _reset_released(fake, states)


def test_reset_disables_every_button_until_empty(cell):
    fake, states, process, _ = cell
    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.RESETTING)

    assert not _call(fake.fill, CellFill.Request()).success
    assert not _call(process, CellProcess.Request()).success
    _reset_released(fake, states)


GREEN_BATCH = [
    _belt_gear("belt-1", -0.4),
    _belt_gear("belt-2", -0.3, intact=False, color="WHITE"),
    _belt_gear("belt-3", -0.2),
]


def _loaded_stations(fake, states, process, gears=GREEN_BATCH, scrapped=5):
    """Sorts one Batch with `scrapped` Gearwheels counted into the bin; the next run waits."""
    _scrapped_batch(fake, states, process, scrapped, gears)
    assert _wait(lambda: len(fake.goals) == 2)


def test_reset_exchanges_only_the_non_empty_pallets_and_the_bin(cell):
    fake, states, process, _ = cell
    _loaded_stations(fake, states, process)
    assert [st.count for st in states[-1].stations] == [0, 2, 0, 5]

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)

    assert sorted(e for e in fake.log if e.startswith("exchange:")) == [
        "exchange:GREEN",
        "exchange:SCRAP",
    ]
    assert sorted(fake.workcell.resets) == ["GREEN", "SCRAP"]
    assert fake.log.index("exchange_done:GREEN") < fake.log.index("clear")


def test_reset_waits_for_the_held_gearwheel_to_be_dropped_then_exchanges_its_pallet(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, MIXED_BATCH)
    assert _wait(lambda: len(states[-1].belt_gears) == len(MIXED_BATCH))
    fake.release.set()
    assert _wait(lambda: len(fake.arm.goals) == 1)  # the arm holds the first Gearwheel

    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.RESETTING)
    time.sleep(0.3)
    assert ConveyorRun.Goal.FLUSH not in fake.goals  # the arm is not HOME yet

    fake.arm.release.set()  # the cycle finishes: the Gearwheel lands on its Pallet
    assert _wait(lambda: fake.log.count("home") == 1)
    _reset_released(fake, states)

    assert len(fake.arm.goals) == 1  # the rest of the Batch is dropped, not sorted
    assert fake.workcell.resets == ["GREEN"]  # the lead Gearwheel's Pallet
    assert fake.log.index("home") < fake.log.index("belt:FLUSH")


def test_a_failed_flush_faults_the_cell(cell):
    fake, states, _, _ = cell
    fake.stop_reason, fake.success = "FAULT", False

    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: ConveyorRun.Goal.FLUSH in fake.goals)
    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert fake.workcell.clears == 0


def test_a_failed_station_exchange_during_reset_faults_the_cell(cell):
    fake, states, process, _ = cell
    _loaded_stations(
        fake, states, process, gears=[_belt_gear("belt-1", -0.4, color="WHITE")], scrapped=0
    )
    fake.stations.success = False

    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: ConveyorRun.Goal.FLUSH in fake.goals)
    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert _wait(lambda: {"device": "station_white", "code": "EXCHANGE_FAULT_1"} in fake.faults)


# Review follow-up (D33): no device result may be lost or applied to the wrong run.


def test_a_pallet_exchange_failing_after_stop_still_faults_the_cell(cell):
    fake, states, process, stop = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.hold.set()
    fake.stations.success = False
    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: "exchange:GREEN" in fake.log)
    assert _call(stop, CellStop.Request()).success

    fake.stations.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert _wait(lambda: fake.faults == [{"device": "station_green", "code": "EXCHANGE_FAULT_1"}])
    assert fake.freezes == [True]


def test_a_bin_exchange_failing_during_reset_still_faults_the_cell(cell):
    fake, states, process, _ = cell
    fake.stations.hold.set()
    fake.stations.success = False
    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)
    assert _wait(lambda: "exchange:SCRAP" in fake.log)
    assert _call(fake.reset, CellReset.Request()).success

    fake.stations.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert _wait(lambda: {"device": "station_scrap", "code": "EXCHANGE_FAULT_1"} in fake.faults)
    assert ConveyorRun.Goal.FLUSH not in fake.goals


def test_the_flush_exit_count_decides_the_bin_exchange(cell):
    fake, states, _, _ = cell
    assert _call(fake.reset, CellReset.Request()).success
    assert _wait(lambda: ConveyorRun.Goal.FLUSH in fake.goals)
    fake.exit_count_delta = 4  # the bin was empty; the flush itself fills it

    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.EMPTY)
    assert fake.workcell.resets == ["SCRAP"]
    assert fake.log.index("exchange_done:SCRAP") < fake.log.index("clear")


def test_process_after_stop_waits_for_the_bin_instead_of_faulting(cell):
    fake, states, process, stop = cell
    fake.stations.hold.set()
    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)
    assert _wait(lambda: fake.log.count("home") == 3)  # Batch sorted, the bin still away
    assert _call(stop, CellStop.Request()).success

    assert _call(process, CellProcess.Request()).success
    time.sleep(0.3)
    assert len(fake.goals) == 1  # no belt run while the bin is away
    assert states[-1].conveyor_status == ConveyorStatus.FEEDING

    fake.stations.release.set()
    assert _wait(lambda: len(fake.goals) == 2)
    assert fake.faults == []


def test_stop_during_the_final_flush_lets_it_run_out_to_empty(cell):
    fake, states, process, stop = cell
    _sorted_batch(fake, states, process, MIXED_BATCH, remaining=0)
    assert _wait(lambda: fake.goals == [ConveyorRun.Goal.RUN_TO_PICKZONE, ConveyorRun.Goal.FLUSH])
    assert _call(stop, CellStop.Request()).success
    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.STOPPED)

    fake.release.set()

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.EMPTY)
    assert (fake.stop_calls, fake.finishes) == (0, 0)  # a flush runs out by itself


def test_process_after_stop_at_the_end_of_the_deck_runs_the_final_flush(cell):
    fake, states, process, stop = cell
    fake.stations.hold.set()  # keeps the bin away, so the cell waits in FEEDING
    _scrapped_batch(fake, states, process, BIN_EXCHANGE_THRESHOLD)
    fake.feeder.publish(0)
    assert _wait(lambda: fake.log.count("home") == 3)
    assert _call(stop, CellStop.Request()).success

    assert _call(process, CellProcess.Request()).success
    fake.stations.release.set()

    assert _wait(lambda: len(fake.goals) == 2)
    assert fake.goals[-1] == ConveyorRun.Goal.FLUSH


# D32: a Gearwheel left in the DexterousPalm by an EmergencyStop is finished onto its Pallet.


def _estop_holding(fake, states, process):
    """EmergencyStop while the arm carries the lead (GREEN) Gearwheel, then Reset."""
    fake.arm.hold.clear()
    fake.arm.hold_at_grasp.set()
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, MIXED_BATCH)
    assert _wait(lambda: len(states[-1].belt_gears) == len(MIXED_BATCH))
    fake.release.set()
    assert _wait(lambda: "mark" in fake.log)  # grasped, not yet released
    assert _call(fake.estop, CellStop.Request()).success
    assert _wait(lambda: fake.arm.cancelled == 1)
    fake.arm.hold_at_grasp.clear()
    assert _call(fake.reset, CellReset.Request()).success


def test_reset_finishes_the_held_gearwheel_onto_its_pallet_before_the_flush(cell):
    fake, states, process, _ = cell

    _estop_holding(fake, states, process)
    _reset_released(fake, states)

    place = fake.arm.goals[-1]
    assert (len(fake.arm.goals), place.place_only, place.drop_coords.y) == (2, True, -0.1)
    assert fake.log.index("commit") < fake.log.index("belt:FLUSH")
    assert fake.workcell.resets == ["GREEN"]  # its Pallet now holds it, so it is exchanged
    assert fake.faults == []


def test_a_failed_place_of_the_held_gearwheel_faults_the_reset(cell):
    fake, states, process, _ = cell
    _estop_holding(fake, states, process)
    fake.arm.success = False

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    assert _wait(lambda: {"device": "arm", "code": "PLACE_FAILED"} in fake.faults)
    assert ConveyorRun.Goal.FLUSH not in fake.goals


def test_an_arm_stopped_after_its_drop_holds_nothing_to_place(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, MIXED_BATCH)
    assert _wait(lambda: len(states[-1].belt_gears) == len(MIXED_BATCH))
    fake.release.set()
    assert _wait(lambda: len(fake.arm.goals) == 1)
    assert _call(fake.estop, CellStop.Request()).success
    assert _wait(lambda: fake.arm.cancelled == 1)

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)

    assert len(fake.arm.goals) == 1


# hand-sim-7kss: device faults reported by status, and recovery through FAULT_ACK.


def _faults_from_status(fake, publish, expected):
    def raised() -> bool:
        publish()  # a first message can precede subscription matching
        return expected in fake.faults

    assert _wait(raised)


def test_a_drive_fault_in_the_belt_status_faults_the_cell_even_when_idle(cell):
    fake, states, _, _ = cell

    _faults_from_status(
        fake,
        lambda: fake.publish_encoder(0.0, belt_fault=7, drives_ok=False),
        {"device": "conveyor", "code": "DRIVE_FAULT_7"},
    )

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)
    time.sleep(0.2)
    assert (
        fake.faults.count({"device": "conveyor", "code": "DRIVE_FAULT_7"}) == 1
    )  # edge, not level
    assert fake.freezes == [True]


def test_a_feeder_fault_in_its_status_faults_the_cell(cell):
    fake, states, _, _ = cell

    _faults_from_status(
        fake,
        lambda: fake.feeder.publish(40, state="FAULT", fault=3),
        {"device": "feeder", "code": "FEEDER_FAULT_3"},
    )

    assert _wait(lambda: states[-1].conveyor_status == ConveyorStatus.FAULT)


def test_an_open_estop_chain_faults_the_cell(cell):
    fake, _, _, _ = cell

    _faults_from_status(
        fake,
        lambda: fake.publish_encoder(0.0, estop_chain_ok=False),
        {"device": "safety", "code": "ESTOP_CHAIN_OPEN"},
    )


def test_reset_after_a_fault_acknowledges_it_before_anything_moves(cell):
    fake, states, _, _ = cell
    _faults_from_status(
        fake,
        lambda: fake.publish_encoder(0.0, belt_fault=7, drives_ok=False),
        {"device": "conveyor", "code": "DRIVE_FAULT_7"},
    )
    fake.publish_encoder(0.0)  # the ack will clear it; the edge must not re-raise meanwhile

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)

    assert fake.freezes == [True, False]
    assert fake.log.index("fault_ack") < fake.log.index("belt:FLUSH")


def test_a_failed_fault_ack_keeps_the_cell_in_fault(cell):
    fake, states, _, _ = cell
    assert _call(fake.estop, CellStop.Request()).success
    fake.fault_ack_ok = False

    assert _call(fake.reset, CellReset.Request()).success

    assert _wait(lambda: {"device": "cell", "code": "FAULT_ACK_FAILED"} in fake.faults)
    assert states[-1].conveyor_status == ConveyorStatus.FAULT
    assert ConveyorRun.Goal.FLUSH not in fake.goals


def test_reset_after_an_estop_during_an_exchange_releases_it_and_ends_empty(cell):
    fake, states, process, _ = cell
    fake.workcell.full_colors = {"GREEN"}
    fake.stations.hold.set()
    _sorted_batch(fake, states, process, MIXED_BATCH)
    assert _wait(lambda: "exchange:GREEN" in fake.log)
    assert _call(fake.estop, CellStop.Request()).success
    fake.stations.release.set()  # the lane would go on, but the FREEZE holds it

    assert _call(fake.reset, CellReset.Request()).success
    _reset_released(fake, states)  # deadlocked before: the reset waited for a frozen exchange

    assert fake.workcell.resets[0] == "GREEN"


def test_the_batch_is_registered_where_the_belt_stopped_not_where_status_last_saw_it(cell):
    fake, states, process, _ = cell
    _fill(fake, states)
    assert _call(process, CellProcess.Request()).success
    assert _wait(lambda: len(fake.goals) == 1)
    fake.publish_encoder(500.0, [_belt_gear("belt-1", 0.1), _belt_gear("belt-2", 0.6)])
    assert _wait(lambda: len(states[-1].belt_gears) == 2)

    fake.encoder_mm = 620.0  # the belt ran 120 mm more before the eye stopped it
    fake.release.set()

    assert _wait(lambda: len(fake.workcell.registered) == 2)
    assert [(r[0], round(r[2], 3)) for r in fake.workcell.registered] == [
        ("belt-1", -0.02),
        ("belt-2", 0.48),  # carried into the PickZone by the last 120 mm
    ]


def test_the_lead_gearwheel_braked_past_the_eye_is_still_part_of_the_batch(cell):
    fake, states, process, _ = cell
    # The drive ramps down after the eye trips, so the lead stops a little past the zone edge.
    gears = [_belt_gear("belt-1", -0.54), _belt_gear("belt-2", -0.3)]

    _run_to_eye(fake, states, process, gears)

    assert [r[0] for r in fake.workcell.registered] == ["belt-1", "belt-2"]
