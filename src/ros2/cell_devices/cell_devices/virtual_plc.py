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

from cell_devices.register_map import (
    ACK_PAIRS,
    HOLDING,
    INPUT,
    MAP_VERSION,
    RING_BASE,
    RING_ENTRIES,
    RING_WORDS,
)

_FC_HOLDING = 3
_FC_INPUT = 4
_TICK_S = 0.02


class VirtualPlcServer:
    """Modbus TCP server on its own thread/loop; echoes every *_seq to its ack register."""

    def __init__(self, host: str, port: int) -> None:
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

    def tick(self) -> None:
        for seq_name, ack_name in ACK_PAIRS:
            (seq,) = self._context.getValues(_FC_HOLDING, HOLDING[seq_name], 1)
            self._context.setValues(_FC_INPUT, INPUT[ack_name], [seq])

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
        while True:
            self.tick()
            await asyncio.sleep(_TICK_S)
