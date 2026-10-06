"""EventLoop: one thread that applies queued events in order, the Cell's only writer."""

import queue
import threading
from collections.abc import Callable
from typing import Any

_ASK_TIMEOUT_S = 10.0


class EventLoop:
    def __init__(self, logger: Any) -> None:
        self._log = logger
        self._events: queue.SimpleQueue = queue.SimpleQueue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def post(self, handler: Callable[..., Any], *args: Any) -> None:
        self._events.put((handler, args))

    def ask(self, handler: Callable[[], tuple[bool, str]]) -> tuple[bool, str]:
        """Runs an intent on the loop and waits for its (success, message)."""
        done = threading.Event()
        reply: list[tuple[bool, str]] = []
        self.post(lambda: (reply.append(handler()), done.set()))
        if not done.wait(_ASK_TIMEOUT_S) or not reply:
            return False, "Cell busy"
        return reply[0]

    def stop(self) -> None:
        """Ends the loop after the events already queued."""
        self._events.put(None)
        self._thread.join(timeout=5.0)

    def _run(self) -> None:
        while (event := self._events.get()) is not None:
            handler, args = event
            try:
                handler(*args)
            except Exception as err:  # one bad event must not kill the cell
                self._log.error(f"Cell event {getattr(handler, '__name__', handler)} failed: {err}")
