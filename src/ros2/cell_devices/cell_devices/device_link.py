"""DeviceLink: one device node's lazy, self-healing Modbus link to the cell controller.

ModbusFieldIo is not thread-safe, so every access holds `lock`. The link connects on first use
and is dropped on any I/O error; the next use reconnects.
"""

import threading
from collections.abc import Callable

from cell_devices.field_io import FieldIoError, FieldIoPort
from cell_devices.modbus_adapter import ModbusFieldIo


class DeviceLink[D]:
    def __init__(
        self, host: str, port: int, make_device: Callable[[FieldIoPort], D], logger
    ) -> None:
        self.lock = threading.Lock()
        self._host, self._port = host, port
        self._make_device = make_device
        self._log = logger
        self._io: ModbusFieldIo | None = None
        self._device: D | None = None

    def device_locked(self) -> D | None:
        """The connected device, or None while the controller is unreachable. Hold `lock`."""
        if self._device is None:
            try:
                io = ModbusFieldIo(self._host, self._port)
                io.connect()
                self._io, self._device = io, self._make_device(io)
            except FieldIoError as err:
                self._log.warning(f"cell controller unreachable: {err}", throttle_duration_sec=5.0)
        return self._device

    def drop_locked(self) -> None:
        """Forget the link after an I/O error. Hold `lock`."""
        if self._io is not None:
            self._io.close()
        self._io = self._device = None
