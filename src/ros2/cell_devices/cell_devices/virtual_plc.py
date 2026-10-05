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
    BeltCmd,
    BeltState,
    FeederCmd,
    StationState,
)

_FC_HOLDING = 3
_FC_INPUT = 4
_TICK_S = 0.02
# The belt and feeder blocks ack their own sequence after executing the command.
_OWN_ACK = ("belt_seq", "feeder_seq")
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
    ) -> None:
        self._lock = threading.Lock()
        self._belt = BeltSim(belt)
        self._feeder = FeederSim(
            feeder or FeederParams(counts_per_mm=self._belt.params.counts_per_mm)
        )
        self._last_belt_seq = 0
        self._last_feeder_seq = 0
        self._prev_belt_state = BeltState.IDLE
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

    def add_belt_item(self, at_mm: float) -> None:
        """SIM seam: the FlexFeeder block puts an item on the belt."""
        with self._lock:
            self._belt.add_item(at_mm)

    def preset_exit_count(self, count: int) -> None:
        """SIM seam: start the latched exit counter at `count` (e.g. just below the 16-bit wrap)."""
        with self._lock:
            self._belt.exit_count = count
            self._context.setValues(_FC_INPUT, INPUT["exit_count"], [count])

    def set_station_state(self, station: str, state: StationState) -> None:
        with self._lock:
            self._context.setValues(_FC_INPUT, INPUT[f"station_{station}_state"], [int(state)])

    def tick(self, dt: float = _TICK_S) -> None:
        with self._lock:
            for seq_name, ack_name in _ECHO_PAIRS:
                (seq,) = self._context.getValues(_FC_HOLDING, HOLDING[seq_name], 1)
                self._context.setValues(_FC_INPUT, INPUT[ack_name], [seq])
            self._tick_belt(dt)
            self._tick_feeder(dt)

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
            self._belt.add_item(placement.at_mm)
            self._publish_placement(placement)
        if (
            self._belt.state == BeltState.STOPPED_AT_EYE
            and self._prev_belt_state != BeltState.STOPPED_AT_EYE
        ):
            self._feeder.disable()
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
            self.tick(now - last)
            last = now
            await asyncio.sleep(_TICK_S)
