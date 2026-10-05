"""CellOrchestratorNode: owns ConveyorStatus and drives the conveyor device and the arm.

Fill loads the FlexFeeder (EMPTY -> LOADED), Process enables the feeder and runs the belt to the
PickZone eye, Stop freezes both. At every eye stop the Batch is registered and sorted: one
SortCycle (PickAndPlace to the colour's PalletStation, then commit the drop) per intact
Gearwheel in belt order. PickAndPlace ends with the arm HOME, so a finished Batch leaves it
there. The 10th drop on a Pallet makes it FULL: PalletExchange runs (the arm is already HOME),
then ResetStation empties that colour, and only then does the next SortCycle start. Then the next
feed run starts, or the final flush when nothing is left (-> EMPTY).
BinExchange and the flush reset land in later Unit 9 tickets.
"""

import json
import threading
from dataclasses import dataclass
from typing import Any

import rclpy
from geometry_msgs.msg import Point
from rclpy.action import ActionClient
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import ExternalShutdownException, MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from robot_control_interfaces.action import ConveyorRun, PickAndPlace, StationExchange
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
    ResetStation,
    ScrapRejected,
)
from std_msgs.msg import String

from domain import (
    PICK_ZONE_Y_RANGE,
    BeltGear,
    CellState,
    ConveyorStatus,
    ExchangeState,
    StationName,
    StationStatus,
)

_FILL_FROM = (ConveyorStatus.EMPTY,)
_PROCESS_FROM = (ConveyorStatus.LOADED, ConveyorStatus.STOPPED)
_STOP_FROM = (ConveyorStatus.FEEDING, ConveyorStatus.HALTED)
_STATE_QOS = QoSProfile(
    depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL
)
_OFFSET_PUBLISH_HZ = 5.0
_SORT_POLL_S = 0.02
_SORT_TIMEOUT_S = 120.0
_EXCHANGE_TIMEOUT_S = 120.0
_PALLET_COLORS = tuple(name.value for name in StationName)


@dataclass(frozen=True)
class _Pick:
    """An intact Gearwheel registered at an eye stop, waiting for its SortCycle."""

    id: str
    x: float
    y: float
    color: str


class CellOrchestratorNode(Node):
    def __init__(self, **kwargs) -> None:
        super().__init__("cell_orchestrator", **kwargs)
        self._lock = threading.Lock()
        self._status = ConveyorStatus.EMPTY
        self._belt_offset_m = 0.0
        self._feeder_remaining = 0
        self._belt_gears: list[BeltGear] = []
        self._published_belt: tuple[float, list[BeltGear]] | None = None
        self._registered: set[str] = set()
        self._picked: set[str] = set()
        # PalletStation view: counts follow WorkcellNode's snapshot, exchange states the devices.
        self._pallet_counts = dict.fromkeys(_PALLET_COLORS, 0)
        self._exchange_states = dict.fromkeys(_PALLET_COLORS, ExchangeState.HOME)
        self._pending: list[_Pick] = []
        # Held by a SortCycle worker for its whole run, so a resumed Batch waits for the old one.
        self._sort_lock = threading.Lock()
        self._sort_thread: threading.Thread | None = None
        # Bumped on every Process and Stop so a late result of an old goal is ignored.
        self._run_id = 0
        self._full_color: str | None = None  # set by the commit of a Pallet's 10th Gearwheel

        group = ReentrantCallbackGroup()
        self._state_pub = self.create_publisher(String, "cell/state", _STATE_QOS)
        self._run_client = ActionClient(self, ConveyorRun, "conveyor/run", callback_group=group)
        self._stop_client = self.create_client(ConveyorStop, "conveyor/stop", callback_group=group)
        self._feeder_fill_client = self.create_client(
            FeederFill, "feeder/fill", callback_group=group
        )
        self._feeder_enable_client = self.create_client(
            FeederEnable, "feeder/enable", callback_group=group
        )
        self._register_client = self.create_client(
            RegisterGear, "workcell/register_gear", callback_group=group
        )
        self._drop_slot_client = self.create_client(
            GetDropSlot, "workcell/get_drop_slot", callback_group=group
        )
        self._scrap_client = self.create_client(
            ScrapRejected, "workcell/scrap_rejected", callback_group=group
        )
        self._mark_client = self.create_client(
            MarkGrasped, "workcell/mark_grasped", callback_group=group
        )
        self._commit_client = self.create_client(
            CommitDrop, "workcell/commit_drop", callback_group=group
        )
        self._reset_station_client = self.create_client(
            ResetStation, "workcell/reset_station", callback_group=group
        )
        self._exchange_clients = {
            color: ActionClient(
                self, StationExchange, f"station/{color.lower()}/exchange", callback_group=group
            )
            for color in _PALLET_COLORS
        }
        self._arm_client = ActionClient(
            self, PickAndPlace, "arm_controller/pick_and_place", callback_group=group
        )
        self.create_subscription(
            String, "workcell/state", self._on_workcell_state, 10, callback_group=group
        )
        self.create_subscription(
            String, "feeder/status", self._on_feeder_status, 10, callback_group=group
        )
        self.create_service(CellFill, "cell/fill", self._on_fill, callback_group=group)
        self.create_subscription(
            String, "conveyor/status", self._on_conveyor_status, 10, callback_group=group
        )
        self.create_service(CellProcess, "cell/process", self._on_process, callback_group=group)
        self.create_service(CellStop, "cell/stop", self._on_stop, callback_group=group)
        self.create_timer(1.0 / _OFFSET_PUBLISH_HZ, self._on_offset_timer, callback_group=group)
        self._publish_state()

    def destroy_node(self) -> None:
        with self._lock:
            self._run_id += 1  # no further run or SortCycle starts
        thread = self._sort_thread
        if thread is not None:
            thread.join(timeout=5.0)
        super().destroy_node()

    def _publish_state(self) -> None:
        with self._lock:
            state = CellState(
                conveyor_status=self._status,
                feeder_remaining=self._feeder_remaining,
                belt_offset_m=self._belt_offset_m,
                belt_gears=self._visible_gears_locked(),
                stations=[
                    StationStatus(
                        name=StationName(color),
                        exchange_state=self._exchange_states[color],
                        count=self._pallet_counts[color],
                    )
                    for color in _PALLET_COLORS
                ],
            )
            self._published_belt = (self._belt_offset_m, self._visible_gears_locked())
        self._state_pub.publish(String(data=state.model_dump_json()))

    def _visible_gears_locked(self) -> list[BeltGear]:
        """Gearwheels the arm has taken off the belt no longer ride it."""
        return [g for g in self._belt_gears if g.id not in self._picked]

    def _set_status(self, status: ConveyorStatus) -> None:
        with self._lock:
            self._status = status
        self._publish_state()

    def _on_conveyor_status(self, msg: String) -> None:
        try:
            raw = json.loads(msg.data)
            encoder_mm = float(raw["encoder_mm"])
            gears = [BeltGear(**g) for g in raw.get("gears", [])]
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed conveyor/status", throttle_duration_sec=5)
            return
        with self._lock:
            self._belt_offset_m = encoder_mm / 1000.0
            self._belt_gears = gears

    def _on_workcell_state(self, msg: String) -> None:
        """Pallet counts are WorkcellNode's truth: intact Gearwheels dropped, per colour."""
        try:
            processed = json.loads(msg.data)["processed"]
            counts = dict.fromkeys(_PALLET_COLORS, 0)
            for entry in processed:
                if entry.get("intact", True) and entry["color"] in counts:
                    counts[entry["color"]] += 1
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed workcell/state", throttle_duration_sec=5)
            return
        with self._lock:
            changed = counts != self._pallet_counts
            self._pallet_counts = counts
        if changed:
            self._publish_state()

    def _on_feeder_status(self, msg: String) -> None:
        try:
            remaining = int(json.loads(msg.data)["remaining"])
        except (ValueError, KeyError, TypeError):
            self.get_logger().warning("Ignoring malformed feeder/status", throttle_duration_sec=5)
            return
        with self._lock:
            changed = remaining != self._feeder_remaining
            self._feeder_remaining = remaining
        if changed:
            self._publish_state()

    def _on_offset_timer(self) -> None:
        with self._lock:
            changed = (self._belt_offset_m, self._visible_gears_locked()) != self._published_belt
        if changed:
            self._publish_state()

    def _on_fill(self, _request, response):
        if not self._feeder_fill_client.wait_for_service(timeout_sec=1.0):
            response.message = "FlexFeeder device unavailable"
            return response
        with self._lock:
            if self._status not in _FILL_FROM:
                response.message = f"Fill refused in {self._status.value}"
                return response
        # SIM seeds the deck from the controller's own entropy; tests seed it via the device.
        result = self._call_blocking(self._feeder_fill_client, FeederFill.Request(seed=0))
        if result is None or not result.success:
            response.message = "FlexFeeder refused Fill"
            return response
        self._set_status(ConveyorStatus.LOADED)
        response.success, response.message = True, "Fill started"
        return response

    @staticmethod
    def _call_blocking(client: Any, request: Any, timeout_s: float = 5.0) -> Any:
        """Reentrant callback group + multithreaded executor: waiting here does not block spin."""
        done = threading.Event()
        future = client.call_async(request)
        future.add_done_callback(lambda _: done.set())
        return future.result() if done.wait(timeout_s) else None

    def _on_process(self, _request, response):
        if not self._run_client.wait_for_server(timeout_sec=1.0):
            response.message = "Conveyor device unavailable"
            return response
        with self._lock:
            if self._status not in _PROCESS_FROM:
                response.message = f"Process refused in {self._status.value}"
                return response
            previous = self._status
            resume = bool(self._pending)  # Stopped mid-Batch: finish sorting before the belt runs
            self._status = ConveyorStatus.HALTED if resume else ConveyorStatus.FEEDING
            self._run_id += 1
            run_id = self._run_id
        self._publish_state()
        if resume:
            self._start_sorting(run_id)
        else:
            self._start_run(run_id, ConveyorRun.Goal.RUN_TO_PICKZONE, previous)
        response.success, response.message = True, "Process started"
        return response

    def _start_run(self, run_id: int, mode: int, previous: ConveyorStatus) -> None:
        """Sends one belt run; the cell is already FEEDING."""
        if mode == ConveyorRun.Goal.RUN_TO_PICKZONE:
            # Enabling is idempotent and the controller disables the feeder itself at the eye stop.
            self._feeder_enable_client.call_async(FeederEnable.Request(enable=True))
        goal = ConveyorRun.Goal(mode=mode)
        self._run_client.send_goal_async(goal).add_done_callback(
            lambda fut: self._on_goal_response(fut, run_id, previous, mode)
        )

    def _on_goal_response(
        self, future: Any, run_id: int, previous: ConveyorStatus, mode: int
    ) -> None:
        handle = future.result()
        if not handle.accepted:
            self._finish_run(run_id, previous)
            return
        handle.get_result_async().add_done_callback(lambda fut: self._on_result(fut, run_id, mode))

    def _on_result(self, future: Any, run_id: int, mode: int) -> None:
        result = future.result().result
        reason = result.stop_reason
        if result.exit_count_delta and not self._scrap_exited(result.exit_count_delta):
            self._finish_run(run_id, ConveyorStatus.FAULT)
            return
        if result.success and mode == ConveyorRun.Goal.RUN_TO_PICKZONE:
            if reason != "STOPPED_AT_EYE":
                self._finish_run(run_id, ConveyorStatus.FAULT)
            elif self._register_batch(run_id):
                self._finish_run(run_id, ConveyorStatus.HALTED)
                self._start_sorting(run_id)
            else:
                self._finish_run(run_id, ConveyorStatus.FAULT)
        elif result.success and reason == "FLUSH_DONE":
            self._finish_flush(run_id)
        elif reason == "STOPPED":
            self._finish_run(run_id, ConveyorStatus.STOPPED)
        else:
            self._finish_run(run_id, ConveyorStatus.FAULT)

    def _scrap_exited(self, count: int) -> bool:
        """The exit eye counted `count` Gearwheels: the oldest Rejected ones are now Scrapped.

        Counted on any result, a stopped or superseded run included: they did fall off the belt.
        """
        if self._notify(self._scrap_client, ScrapRejected.Request(count=count)):
            return True
        self.get_logger().error(f"WorkcellNode refused to scrap {count} Gearwheels; cell FAULT")
        return False

    def _register_batch(self, run_id: int) -> bool:
        """Registers each new Gearwheel in the PickZone with WorkcellNode, lead first.

        WorkcellNode makes the intact ones pickable and the defective ones Rejected; the intact
        ones become the pending SortCycles. Gearwheels seen at an earlier stop are skipped.
        """
        with self._lock:
            if run_id != self._run_id:
                return True
            lo, hi = PICK_ZONE_Y_RANGE
            batch = sorted(
                (g for g in self._belt_gears if lo <= g.y <= hi and g.id not in self._registered),
                key=lambda g: g.y,
            )
        picks: list[_Pick] = []
        for gear in batch:
            request = RegisterGear.Request(id=gear.id, color=gear.color.value, intact=gear.intact)
            request.coords.x, request.coords.y = gear.x, gear.y
            result = self._call_blocking(self._register_client, request)
            if result is None or not result.success:
                self.get_logger().error(f"WorkcellNode refused to register {gear.id}; cell FAULT")
                return False
            with self._lock:
                self._registered.add(gear.id)
            if gear.intact:
                picks.append(_Pick(gear.id, gear.x, gear.y, gear.color.value))
        with self._lock:
            if run_id == self._run_id:
                self._pending = picks
        return True

    def _start_sorting(self, run_id: int) -> None:
        thread = threading.Thread(target=self._sort_batch, args=(run_id,), daemon=True)
        self._sort_thread = thread
        thread.start()

    def _sort_batch(self, run_id: int) -> None:
        """Runs the pending SortCycles one at a time, then moves the cell on."""
        with self._sort_lock:
            while True:
                with self._lock:
                    if run_id != self._run_id:
                        return  # Stopped (or reset): the in-flight cycle was the last
                    pick = self._pending[0] if self._pending else None
                if pick is None:
                    break
                if not self._sort_cycle(pick):
                    self.get_logger().error(f"SortCycle for {pick.id} failed; cell FAULT")
                    with self._lock:
                        self._pending.clear()
                    self._finish_run(run_id, ConveyorStatus.FAULT)
                    return
                with self._lock:
                    if self._pending and self._pending[0] is pick:
                        self._pending.pop(0)
                    self._picked.add(pick.id)
                self._publish_state()
                if self._pallet_full(pick.color) and not self._exchange_pallet(pick.color):
                    self.get_logger().error(f"PalletExchange for {pick.color} failed; cell FAULT")
                    with self._lock:
                        self._pending.clear()
                    self._finish_run(run_id, ConveyorStatus.FAULT)
                    return
            self._advance(run_id)

    def _sort_cycle(self, pick: _Pick) -> bool:
        """PickAndPlace to the colour's PalletStation, committing the drop as the arm releases."""
        slot = self._call_blocking(
            self._drop_slot_client, GetDropSlot.Request(color=pick.color, intact=True)
        )
        if slot is None or slot.slot_index < 0:
            return False
        goal = PickAndPlace.Goal(use_custom_drop=True)
        goal.pick_coords = Point(x=pick.x, y=pick.y, z=0.0)
        goal.drop_coords = slot.drop_coords
        grasping, releasing = threading.Event(), threading.Event()
        phases = {"GRASPING": grasping, "RELEASING": releasing}

        def on_feedback(msg: Any) -> None:
            event = phases.get(msg.feedback.phase)
            if event is not None:
                event.set()

        sent = threading.Event()
        send = self._arm_client.send_goal_async(goal, feedback_callback=on_feedback)
        send.add_done_callback(lambda _: sent.set())
        if not sent.wait(5.0) or not send.result().accepted:
            return False
        finished = threading.Event()
        result_future = send.result().get_result_async()
        result_future.add_done_callback(lambda _: finished.set())
        marked = committed = False
        self._full_color = None
        waited = 0.0
        while not finished.wait(_SORT_POLL_S):
            waited += _SORT_POLL_S
            if waited > _SORT_TIMEOUT_S:
                return False
            if grasping.is_set() and not marked:
                marked = self._notify(self._mark_client, MarkGrasped.Request())
            if marked and releasing.is_set() and not committed:
                committed = self._commit(pick.color)
        if not result_future.result().result.success:
            return False
        if not marked:
            marked = self._notify(self._mark_client, MarkGrasped.Request())
        if marked and not committed:
            committed = self._commit(pick.color)
        return marked and committed

    def _commit(self, color: str) -> bool:
        """Commits the drop; the 10th Gearwheel on a Pallet (overflow flag) makes it FULL."""
        result = self._call_blocking(self._commit_client, CommitDrop.Request())
        if result is None or not result.success:
            return False
        if result.overflow_occurred:
            self._full_color = color
        return True

    def _pallet_full(self, color: str) -> bool:
        return self._full_color == color

    def _exchange_pallet(self, color: str) -> bool:
        """PalletExchange, then ResetStation: only after both may the next SortCycle start."""
        client = self._exchange_clients[color]
        if not client.wait_for_server(timeout_sec=1.0):
            self._set_exchange_state(color, ExchangeState.FAULT)
            return False
        done = threading.Event()
        outcome: dict[str, bool] = {"success": False}

        def on_feedback(msg: Any) -> None:
            self._set_exchange_state(color, ExchangeState(msg.feedback.exchange_state))

        def on_result(fut: Any) -> None:
            outcome["success"] = bool(fut.result().result.success)
            done.set()

        def on_goal(fut: Any) -> None:
            handle = fut.result()
            if handle.accepted:
                handle.get_result_async().add_done_callback(on_result)
            else:
                done.set()

        client.send_goal_async(
            StationExchange.Goal(), feedback_callback=on_feedback
        ).add_done_callback(on_goal)
        ok = done.wait(_EXCHANGE_TIMEOUT_S) and outcome["success"]
        if not ok:
            self._set_exchange_state(color, ExchangeState.FAULT)
            return False
        if not self._notify(self._reset_station_client, ResetStation.Request(station=color)):
            return False
        self._set_exchange_state(color, ExchangeState.HOME)
        return True

    def _set_exchange_state(self, color: str, state: ExchangeState) -> None:
        with self._lock:
            if self._exchange_states[color] == state:
                return
            self._exchange_states[color] = state
        self._publish_state()

    def _notify(self, client: Any, request: Any) -> bool:
        result = self._call_blocking(client, request)
        return result is not None and result.success

    def _advance(self, run_id: int) -> None:
        """Batch sorted and the arm HOME: next feed run, or the final flush when nothing is left."""
        with self._lock:
            if run_id != self._run_id:
                return
            waiting = any(g.id not in self._registered for g in self._belt_gears)
            more = self._feeder_remaining > 0 or waiting
            self._status = ConveyorStatus.FEEDING
        self._publish_state()
        mode = ConveyorRun.Goal.RUN_TO_PICKZONE if more else ConveyorRun.Goal.FLUSH
        self._start_run(run_id, mode, ConveyorStatus.HALTED)

    def _finish_flush(self, run_id: int) -> None:
        with self._lock:
            if run_id != self._run_id:
                return
            self._registered.clear()
            self._picked.clear()
            self._pending.clear()
        self._set_status(ConveyorStatus.EMPTY)

    def _finish_run(self, run_id: int, status: ConveyorStatus) -> None:
        with self._lock:
            if run_id != self._run_id:
                return
        self._set_status(status)

    def _on_stop(self, _request, response):
        with self._lock:
            if self._status not in _STOP_FROM:
                response.message = f"Stop refused in {self._status.value}"
                return response
            was_feeding = self._status == ConveyorStatus.FEEDING
            self._status = ConveyorStatus.STOPPED
            self._run_id += 1
        self._publish_state()
        self._feeder_enable_client.call_async(FeederEnable.Request(enable=False))
        if was_feeding:
            self._stop_client.call_async(ConveyorStop.Request()).add_done_callback(
                self._on_stop_response
            )
        response.success, response.message = True, "Stop accepted"
        return response

    def _on_stop_response(self, future: Any) -> None:
        result = future.result()
        if result is None or not result.success:
            self.get_logger().error("Conveyor stop failed; cell FAULT")
            self._set_status(ConveyorStatus.FAULT)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = CellOrchestratorNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
