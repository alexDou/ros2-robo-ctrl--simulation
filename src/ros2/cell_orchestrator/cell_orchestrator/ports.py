"""CellPorts: every ROS client the orchestrator talks to, behind plain methods.

Short service calls block (reentrant group + multithreaded executor, so waiting never blocks
spin). Long operations (belt run, station exchange) take a callback that fires once with the
outcome. A cancel that arrives before the goal is accepted is remembered and applied on accept.
"""

import threading
from collections.abc import Callable
from typing import Any

from geometry_msgs.msg import Point
from rclpy.action import ActionClient
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.node import Node
from robot_control_interfaces.action import ConveyorRun, PickAndPlace, StationExchange
from robot_control_interfaces.srv import (
    CellFaultAck,
    ClearWorkspace,
    CommitDrop,
    ConveyorFinish,
    ConveyorFreeze,
    FeederEnable,
    FeederFill,
    FeederQuickEmpty,
    GetDropSlot,
    MarkGrasped,
    RegisterGear,
    ResetStation,
    ScrapRejected,
)

from cell_orchestrator.cell_model import STATIONS, Pick

_CALL_TIMEOUT_S = 5.0
_ACCEPT_TIMEOUT_S = 5.0
BeltDone = Callable[[ConveyorRun.Result | None], None]


class _Goal:
    """One in-flight action goal; a request made before the server accepts it runs on accept."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._handle: Any = None
        self._deferred: list[Callable[[Any], None]] = []

    def accepted(self, handle: Any) -> None:
        with self._lock:
            self._handle = handle
            deferred, self._deferred = self._deferred, []
        for action in deferred:
            action(handle)

    def once_accepted(self, action: Callable[[Any], None]) -> None:
        with self._lock:
            handle = self._handle
            if handle is None:
                self._deferred.append(action)
                return
        action(handle)

    def cancel(self) -> None:
        self.once_accepted(lambda handle: handle.cancel_goal_async())


class CellPorts:
    def __init__(self, node: Node) -> None:
        group = ReentrantCallbackGroup()

        def client(srv: Any, name: str) -> Any:
            return node.create_client(srv, name, callback_group=group)

        self.run_client = ActionClient(node, ConveyorRun, "conveyor/run", callback_group=group)
        self.arm_client = ActionClient(
            node, PickAndPlace, "arm_controller/pick_and_place", callback_group=group
        )
        self._exchange_clients = {
            name: ActionClient(
                node, StationExchange, f"station/{name.lower()}/exchange", callback_group=group
            )
            for name in STATIONS
        }
        self._freeze = client(ConveyorFreeze, "conveyor/freeze")
        self._finish = client(ConveyorFinish, "conveyor/finish")
        self._fault_ack = client(CellFaultAck, "cell/fault_ack")
        self.feeder_fill_client = client(FeederFill, "feeder/fill")
        self._feeder_enable = client(FeederEnable, "feeder/enable")
        self._feeder_empty = client(FeederQuickEmpty, "feeder/quick_empty")
        self._register = client(RegisterGear, "workcell/register_gear")
        self._drop_slot = client(GetDropSlot, "workcell/get_drop_slot")
        self._scrap = client(ScrapRejected, "workcell/scrap_rejected")
        self._mark = client(MarkGrasped, "workcell/mark_grasped")
        self._commit = client(CommitDrop, "workcell/commit_drop")
        self._reset_station = client(ResetStation, "workcell/reset_station")
        self._clear = client(ClearWorkspace, "workcell/clear_workspace")
        self._belt_goal: _Goal | None = None
        self._arm_goal: _Goal | None = None

    @staticmethod
    def call(client: Any, request: Any, timeout_s: float = _CALL_TIMEOUT_S) -> Any:
        done = threading.Event()
        future = client.call_async(request)
        future.add_done_callback(lambda _: done.set())
        return future.result() if done.wait(timeout_s) else None

    def _ok(self, client: Any, request: Any) -> bool:
        result = self.call(client, request)
        return result is not None and result.success

    # FlexFeeder
    def fill_feeder(self) -> bool:
        # SIM seeds the deck from the controller's own entropy; tests seed it via the device.
        return self._ok(self.feeder_fill_client, FeederFill.Request(seed=0))

    def enable_feeder(self, enable: bool) -> None:
        """Idempotent; the controller disables the feeder itself at the eye stop."""
        self._feeder_enable.call_async(FeederEnable.Request(enable=enable))

    def quick_empty_feeder(self) -> bool:
        return self._ok(self._feeder_empty, FeederQuickEmpty.Request())

    # Conveyor and the controller-wide freeze
    def run_belt(self, mode: int, on_done: BeltDone) -> None:
        goal = self._belt_goal = _Goal()

        def on_goal(fut: Any) -> None:
            handle = fut.result()
            if not handle.accepted:
                on_done(None)
                return
            goal.accepted(handle)
            handle.get_result_async().add_done_callback(lambda f: on_done(f.result().result))

        self.run_client.send_goal_async(ConveyorRun.Goal(mode=mode)).add_done_callback(on_goal)

    def finish_belt(self) -> None:
        """Stop (D30): the run in flight ends at the eye (or runs out, for a flush)."""
        if self._belt_goal is not None:
            self._belt_goal.once_accepted(
                lambda _: self._finish.call_async(ConveyorFinish.Request())
            )

    def cancel_belt(self) -> None:
        if self._belt_goal is not None:
            self._belt_goal.cancel()

    def freeze(self, on_failed: Callable[[], None]) -> None:
        """FREEZE every device at once; never blocks the caller."""

        def on_response(fut: Any) -> None:
            result = fut.result()
            if result is None or not result.success:
                on_failed()

        self._freeze.call_async(ConveyorFreeze.Request(freeze=True)).add_done_callback(on_response)

    def fault_ack(self, on_done: Callable[[bool], None]) -> None:
        """FAULT_ACK; on_done(ok) fires once every device has recovered, or it timed out."""

        def on_response(fut: Any) -> None:
            result = fut.result()
            on_done(result is not None and result.success)

        self._fault_ack.call_async(CellFaultAck.Request()).add_done_callback(on_response)

    def release_freeze(self) -> bool:
        return self._ok(self._freeze, ConveyorFreeze.Request(freeze=False))

    # Stations
    def exchange(
        self,
        name: str,
        on_state: Callable[[str], None],
        on_done: Callable[[bool, int], None],
    ) -> None:
        """One exchange HOME -> ... -> HOME; on_done(success, fault code) fires exactly once."""
        client = self._exchange_clients[name]
        if not client.wait_for_server(timeout_sec=1.0):
            on_done(False, 0)
            return

        def on_goal(fut: Any) -> None:
            handle = fut.result()
            if not handle.accepted:
                on_done(False, 0)
                return
            handle.get_result_async().add_done_callback(
                lambda f: on_done(bool(f.result().result.success), int(f.result().result.fault))
            )

        client.send_goal_async(
            StationExchange.Goal(), feedback_callback=lambda m: on_state(m.feedback.exchange_state)
        ).add_done_callback(on_goal)

    def reset_station(self, name: str) -> bool:
        return self._ok(self._reset_station, ResetStation.Request(station=name))

    # WorkcellNode
    def register(self, gear_id: str, x: float, y: float, color: str, intact: bool) -> bool:
        request = RegisterGear.Request(id=gear_id, color=color, intact=intact)
        request.coords.x, request.coords.y = x, y
        return self._ok(self._register, request)

    def scrap(self, count: int) -> int | None:
        """The exit eye counted `count`: returns how many Rejected became Scrapped, None if refused."""
        result = self.call(self._scrap, ScrapRejected.Request(count=count))
        return int(result.scrapped) if result is not None and result.success else None

    def drop_slot(self, color: str) -> Point | None:
        slot = self.call(self._drop_slot, GetDropSlot.Request(color=color, intact=True))
        return None if slot is None or slot.slot_index < 0 else slot.drop_coords

    def mark_grasped(self) -> bool:
        return self._ok(self._mark, MarkGrasped.Request())

    def commit_drop(self) -> CommitDrop.Response | None:
        result = self.call(self._commit, CommitDrop.Request())
        return result if result is not None and result.success else None

    def clear_workspace(self) -> bool:
        return self._ok(self._clear, ClearWorkspace.Request())

    # Arm
    def pick_and_place(
        self, pick: Pick, drop: Point, on_phase: Callable[[str], None], place_only: bool = False
    ) -> Any:
        """Sends one PickAndPlace goal; returns its result future, or None if it was refused.

        place_only (D32): the Gearwheel is already held; the arm only carries it to `drop`.
        """
        goal_msg = PickAndPlace.Goal(use_custom_drop=True, place_only=place_only)
        goal_msg.pick_coords = Point(x=pick.x, y=pick.y, z=0.0)
        goal_msg.drop_coords = drop
        goal = self._arm_goal = _Goal()
        sent = threading.Event()
        send = self.arm_client.send_goal_async(
            goal_msg, feedback_callback=lambda m: on_phase(m.feedback.phase)
        )
        send.add_done_callback(lambda _: sent.set())
        if not sent.wait(_ACCEPT_TIMEOUT_S) or not send.result().accepted:
            return None
        goal.accepted(send.result())
        return send.result().get_result_async()

    def cancel_arm(self) -> None:
        if self._arm_goal is not None:
            self._arm_goal.cancel()

    def ready(self) -> bool:
        return (
            self.run_client.server_is_ready()
            and self.arm_client.server_is_ready()
            and self.feeder_fill_client.service_is_ready()
        )
