"""FieldIoPort: the single seam between device nodes and the cell controller."""

from typing import Protocol


class FieldIoError(RuntimeError):
    """The controller could not be reached or rejected a register access."""


class FieldIoPort(Protocol):
    def connect(self) -> None: ...

    def close(self) -> None: ...

    def read_holding(self, address: int, count: int) -> list[int]: ...

    def read_input(self, address: int, count: int) -> list[int]: ...

    def write_holding(self, address: int, values: list[int]) -> None: ...
