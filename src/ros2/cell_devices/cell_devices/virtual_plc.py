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
from cell_devices.register_map import (
    ACK_PAIRS,
    HOLDING,
    INPUT,
    MAP_VERSION,
    RING_BASE,
    RING_ENTRIES,
    RING_WORDS,
    BeltCmd,
    StationState,
)

_FC_HOLDING = 3
_FC_INPUT = 4
_TICK_S = 0.02
# The belt block acks its own sequence after executing the command.
_ECHO_PAIRS = tuple(pair for pair in ACK_PAIRS if pair[0] != "belt_seq")


def _belt_cmd(word: int) -> BeltCmd:
    """An out-of-range command word is ignored (still acked), never fatal to the tick loop."""
    try:
        return BeltCmd(word)
    except ValueError:
        return BeltCmd.NONE


class VirtualPlcServer:
    """Modbus TCP server on its own thread/loop; echoes every *_seq to its ack register."""

    def __init__(self, host: str, port: int, belt: BeltParams | None = None) -> None:
        self._lock = threading.Lock()
        self._belt = BeltSim(belt)
        self._last_belt_seq = 0
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
