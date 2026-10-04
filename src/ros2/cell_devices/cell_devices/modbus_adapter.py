"""Modbus TCP adapter for FieldIoPort (pymodbus)."""

from pymodbus.client import ModbusTcpClient

from cell_devices.field_io import FieldIoError


class ModbusFieldIo:
    def __init__(self, host: str, port: int, unit: int = 1, timeout_s: float = 1.0) -> None:
        self._unit = unit
        self._client = ModbusTcpClient(host, port=port, timeout=timeout_s)

    def connect(self) -> None:
        if not self._client.connect():
            raise FieldIoError("cannot connect to cell controller")

    def close(self) -> None:
        self._client.close()

    def read_holding(self, address: int, count: int) -> list[int]:
        return self._registers(
            self._client.read_holding_registers(address, count, slave=self._unit)
        )

    def read_input(self, address: int, count: int) -> list[int]:
        return self._registers(self._client.read_input_registers(address, count, slave=self._unit))

    def write_holding(self, address: int, values: list[int]) -> None:
        result = self._client.write_registers(address, values, slave=self._unit)
        if result.isError():
            raise FieldIoError(f"write failed at {address}: {result}")

    @staticmethod
    def _registers(result) -> list[int]:
        if result.isError():
            raise FieldIoError(f"read failed: {result}")
        return list(result.registers)
