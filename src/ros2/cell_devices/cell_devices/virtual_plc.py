"""virtual_plc: SIM stand-in for the cell controller, serving the shared register map."""

import asyncio
import socket
import threading
import time

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusServerContext,
    ModbusSlaveContext,
)
from pymodbus.server import ModbusTcpServer

from cell_devices.belt_sim import BeltParams, BeltSim
from cell_devices.feeder_sim import FeederParams, FeederSim, Placement
from cell_devices.register_map import (
    ACK_PAIRS,
    COLOR_CODES,
    HOLDING,
    INPUT,
    MAP_VERSION,
    RING_BASE,
    RING_ENTRIES,
    RING_WORDS,
    STATIONS,
    BeltCmd,
    BeltState,
    CellCmd,
    FeederCmd,
    FeederState,
    Interlock,
    StationState,
)
from cell_devices.station_sim import BIN_EXCHANGE, PALLET_EXCHANGE, StationParams, StationSim

_FC_HOLDING = 3
_FC_INPUT = 4
_TICK_S = 0.02
_EXCHANGE = 1
# The belt, feeder and station blocks ack their own sequence after executing the command.
_OWN_ACK = ("belt_seq", "feeder_seq", *(f"station_{s}_seq" for s in STATIONS))
_ECHO_PAIRS = tuple(pair for pair in ACK_PAIRS if pair[0] not in _OWN_ACK)


def _belt_cmd(word: int) -> BeltCmd:
    """An out-of-range command word is ignored (still acked), never fatal to the tick loop."""
    try:
        return BeltCmd(word)
    except ValueError:
        return BeltCmd.NONE


def _feeder_cmd(word: int) -> FeederCmd:
    try:
        return FeederCmd(word)
    except ValueError:
        return FeederCmd.NONE


class VirtualPlcServer:
    """Modbus TCP server on its own thread/loop; echoes every *_seq to its ack register."""

    def __init__(
        self,
        host: str,
        port: int,
        belt: BeltParams | None = None,
        feeder: FeederParams | None = None,
        stations: dict[str, StationParams] | None = None,
        time_scale: float = 1.0,
    ) -> None:
        self._lock = threading.Lock()
        self._time_scale = time_scale  # SIM only: simulated seconds per wall second (tests)
        self._belt = BeltSim(belt)
        self._feeder = FeederSim(
            feeder or FeederParams(counts_per_mm=self._belt.params.counts_per_mm)
        )
        defaults = {s: BIN_EXCHANGE if s == "scrap" else PALLET_EXCHANGE for s in STATIONS}
        self._stations = {s: StationSim(p) for s, p in {**defaults, **(stations or {})}.items()}
        self._last_station_seq = dict.fromkeys(STATIONS, 0)
        self._last_belt_seq = 0
        self._last_feeder_seq = 0
        self._prev_belt_state = BeltState.IDLE
        self._last_cell_seq = 0
        self._frozen = False
        self._estop_chain_ok = True
        size = RING_BASE + RING_ENTRIES * RING_WORDS
        self._context = ModbusSlaveContext(
            hr=ModbusSequentialDataBlock(0, [0] * size),
            ir=ModbusSequentialDataBlock(0, [0] * size),
            zero_mode=True,
        )
        self._context.setValues(_FC_INPUT, INPUT["map_version"], [MAP_VERSION])
        self._address = (host, port)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._server: ModbusTcpServer | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="virtual_plc", daemon=True)
        self._thread.start()
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            try:
                socket.create_connection(self._address, timeout=0.2).close()
                return
            except OSError:
                time.sleep(0.02)
        raise RuntimeError(f"virtual_plc did not start listening on {self._address}")

    def stop(self) -> None:
        if self._loop is None or self._thread is None:
            return
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=3.0)

    @property
    def encoder_counts(self) -> int:
        with self._lock:
            return self._belt.encoder_counts

    def add_belt_item(self, at_mm: float, intact: bool = True, seq: int = 0) -> None:
        """SIM seam: the FlexFeeder block puts an item on the belt."""
        with self._lock:
            self._belt.add_item(at_mm, intact, seq)

    def remove_belt_item(self, seq: int) -> None:
        """SIM seam: the arm took the item with placement `seq` (16-bit) off the belt."""
        with self._lock:
            self._belt.remove_item(seq % 2**16)

    def preset_exit_count(self, count: int) -> None:
        """SIM seam: start the latched exit counter at `count` (e.g. just below the 16-bit wrap)."""
        with self._lock:
            self._belt.exit_count = count
            self._context.setValues(_FC_INPUT, INPUT["exit_count"], [count])

    def set_station_state(self, station: str, state: StationState) -> None:
        """SIM seam: park a station in `state` (e.g. the bin AWAY) until the PLC is restarted."""
        with self._lock:
            self._stations[station].force(state)
            self._publish_station(station)

    def break_station_sensor(self, station: str, end: str) -> None:
        """SIM seam: the station's `away` or `home` end sensor never trips (-> FAULT on timeout)."""
        with self._lock:
            self._stations[station].break_sensor(end)

    def repair_station_sensor(self, station: str, end: str) -> None:
        """SIM seam: the end sensor is fixed (before FAULT_ACK homes the station)."""
        with self._lock:
            self._stations[station].repair_sensor(end)

    def inject_drive_fault(self, code: int) -> None:
        """SIM seam: the belt drive trips with fault `code`."""
        with self._lock:
            self._belt.drive_fault(code)

    def inject_feeder_fault(self, code: int) -> None:
        """SIM seam: the FlexFeeder module faults with `code`."""
        with self._lock:
            self._feeder.module_fault(code)

    def set_estop_chain(self, ok: bool) -> None:
        """SIM seam: the hardwired E-stop chain opens (False) or is closed again."""
        with self._lock:
            self._estop_chain_ok = ok

    def tick(self, dt: float = _TICK_S) -> None:
        """Advance by `dt`, in scans of at most _TICK_S: a stalled loop (or a sped-up test) must
        not let an item jump past an eye between two scans, as a real controller never would."""
        while dt > _TICK_S:
            self._scan(_TICK_S)
            dt -= _TICK_S
        self._scan(dt)

    def _scan(self, dt: float) -> None:
        with self._lock:
            for seq_name, ack_name in _ECHO_PAIRS:
                (seq,) = self._context.getValues(_FC_HOLDING, HOLDING[seq_name], 1)
                self._context.setValues(_FC_INPUT, INPUT[ack_name], [seq])
            self._tick_cell()
            # FREEZE halts every motion: the sims see no time pass until it is released.
            dt = 0.0 if self._frozen else dt
            self._tick_stations(dt)
            self._tick_belt(dt)
            self._tick_feeder(dt)
            self._publish_interlocks()

    def _tick_cell(self) -> None:
        cmd, seq = self._context.getValues(_FC_HOLDING, HOLDING["cell_cmd"], 2)
        if seq == self._last_cell_seq:
            return
        self._last_cell_seq = seq
        if cmd == CellCmd.FREEZE:
            self._frozen = True
            self._belt.halt()
        elif cmd == CellCmd.RELEASE_FREEZE:
            self._frozen = False
        elif cmd == CellCmd.FAULT_ACK:
            self._belt.ack_fault()
            self._feeder.ack_fault()
            for station in self._stations.values():
                station.ack_fault()

    def _publish_interlocks(self) -> None:
        bits = Interlock(0)
        if self._stations["scrap"].state == StationState.HOME:
            bits |= Interlock.BIN_HOME
        if self._feeder.state != FeederState.FAULT:
            bits |= Interlock.FEEDER_OK
        if self._belt.state != BeltState.FAULT:
            bits |= Interlock.DRIVES_OK
        if self._estop_chain_ok:
            bits |= Interlock.ESTOP_CHAIN_OK
        self._context.setValues(_FC_INPUT, INPUT["interlocks"], [int(bits)])
        self._context.setValues(_FC_INPUT, INPUT["belt_fault"], [self._belt.fault])
        self._context.setValues(_FC_INPUT, INPUT["feeder_fault"], [self._feeder.fault])

    def _tick_stations(self, dt: float) -> None:
        for name, station in self._stations.items():
            cmd, seq = self._context.getValues(_FC_HOLDING, HOLDING[f"station_{name}_cmd"], 2)
            if seq != self._last_station_seq[name]:
                self._last_station_seq[name] = seq
                if cmd == _EXCHANGE:
                    station.exchange()
                self._context.setValues(_FC_INPUT, INPUT[f"station_{name}_ack_seq"], [seq])
            station.step(dt)
            self._publish_station(name)

    def _publish_station(self, name: str) -> None:
        station = self._stations[name]
        self._context.setValues(_FC_INPUT, INPUT[f"station_{name}_state"], [int(station.state)])
        self._context.setValues(_FC_INPUT, INPUT[f"station_{name}_fault"], [station.fault])

    def _tick_belt(self, dt: float) -> None:
        (scrap_state,) = self._context.getValues(_FC_INPUT, INPUT["station_scrap_state"], 1)
        scrap_home = scrap_state == StationState.HOME
        cmd, seq = self._context.getValues(_FC_HOLDING, HOLDING["belt_cmd"], 2)
        if seq != self._last_belt_seq:
            self._last_belt_seq = seq
            self._belt.command(_belt_cmd(cmd), scrap_home)
            self._context.setValues(_FC_INPUT, INPUT["belt_ack_seq"], [seq])
        self._belt.step(dt, scrap_home)

        counts = self._belt.encoder_counts
        self._context.setValues(_FC_INPUT, INPUT["belt_state"], [int(self._belt.state)])
        self._context.setValues(_FC_INPUT, INPUT["encoder_hi"], [counts >> 16, counts & 0xFFFF])
        self._context.setValues(_FC_INPUT, INPUT["exit_count"], [self._belt.exit_count])

    def _tick_feeder(self, dt: float) -> None:
        cmd, seq = self._context.getValues(_FC_HOLDING, HOLDING["feeder_cmd"], 2)
        if seq != self._last_feeder_seq:
            self._last_feeder_seq = seq
            (seed,) = self._context.getValues(_FC_HOLDING, HOLDING["fill_seed"], 1)
            self._feeder.command(_feeder_cmd(cmd), seed)
            self._context.setValues(_FC_INPUT, INPUT["feeder_ack_seq"], [seq])

        # Placement is allowed only while the belt runs toward the eye; the feeder is
        # disabled at the eye stop (the edge into STOPPED_AT_EYE, not the settled state).
        feeding = self._belt.feeding
        for placement in self._feeder.step(dt, feeding, self._belt.travel_mm):
            self._belt.add_item(placement.at_mm, placement.intact, placement.seq)
            self._publish_placement(placement)
        if (
            self._belt.state == BeltState.STOPPED_AT_EYE
            and self._prev_belt_state != BeltState.STOPPED_AT_EYE
        ):
            self._feeder.disable()
        if self._belt.feeding and self._feeder.state == FeederState.EMPTY:
            # Nothing can arrive any more: the run ends like FINISH_RUN (on to the eye with what
            # is upstream, or at once), so a run sent on a stale "remaining" never runs forever.
            (scrap_state,) = self._context.getValues(_FC_INPUT, INPUT["station_scrap_state"], 1)
            self._belt.command(BeltCmd.FINISH_RUN, scrap_state == StationState.HOME)
        self._prev_belt_state = self._belt.state

        self._context.setValues(_FC_INPUT, INPUT["feeder_state"], [int(self._feeder.state)])
        self._context.setValues(_FC_INPUT, INPUT["remaining"], [self._feeder.remaining])
        self._context.setValues(_FC_INPUT, INPUT["placement_count"], [self._feeder.placement_count])

    def _publish_placement(self, p: Placement) -> None:
        # Placement count is written after the record so a poller never sees a half-written entry.
        base = RING_BASE + (p.seq % RING_ENTRIES) * RING_WORDS
        self._context.setValues(
            _FC_INPUT,
            base,
            [
                p.seq,
                p.lateral_x_mm % 2**16,
                p.encoder_counts >> 16,
                p.encoder_counts & 0xFFFF,
                COLOR_CODES.index(p.color),
                int(p.intact),
            ],
        )

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        tasks = [self._loop.create_task(self._serve()), self._loop.create_task(self._tick_loop())]
        try:
            self._loop.run_forever()
        finally:
            if self._server is not None:
                self._loop.run_until_complete(self._server.shutdown())
            for task in tasks:
                task.cancel()
            self._loop.run_until_complete(asyncio.gather(*tasks, return_exceptions=True))
            self._loop.close()

    async def _serve(self) -> None:
        # pymodbus binds to the running loop at construction, so build it here.
        self._server = ModbusTcpServer(
            ModbusServerContext(slaves=self._context, single=True), address=self._address
        )
        await self._server.serve_forever()

    async def _tick_loop(self) -> None:
        last = time.monotonic()
        while True:
            now = time.monotonic()
            self.tick((now - last) * self._time_scale)
            last = now
            await asyncio.sleep(_TICK_S)
