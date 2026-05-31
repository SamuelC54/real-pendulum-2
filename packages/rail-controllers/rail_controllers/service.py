from __future__ import annotations

import threading
import time
from typing import Any

from .registry import create_controller, list_metadata

_lock = threading.Lock()
_active_id: str | None = None
_active_name: str | None = None
_controller: Any | None = None
_started_at: float | None = None
_error: str | None = None
_step_count = 0


def _status_unlocked() -> dict[str, Any]:
    return {
        "active": _active_id is not None,
        "id": _active_id,
        "name": _active_name,
        "startedAt": _started_at,
        "stepCount": _step_count,
        "error": _error,
    }


def list_controllers() -> list[dict[str, Any]]:
    return list_metadata()


def status() -> dict[str, Any]:
    with _lock:
        return _status_unlocked()


def start(controller_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    global _active_id, _active_name, _controller, _started_at, _error, _step_count
    with _lock:
        if _active_id is not None:
            raise RuntimeError(f"Controller already running: {_active_name or _active_id}")
        try:
            ctrl = create_controller(controller_id, params or {})
        except Exception as e:
            raise RuntimeError(str(e)) from e
        meta = next((m for m in list_metadata() if m["id"] == controller_id), None)
        _active_id = controller_id
        _active_name = meta["name"] if meta else controller_id
        _controller = ctrl
        _started_at = time.time()
        _error = None
        _step_count = 0
        return _status_unlocked()


def stop() -> dict[str, Any]:
    global _active_id, _active_name, _controller, _started_at, _error, _step_count
    with _lock:
        _active_id = None
        _active_name = None
        _controller = None
        _started_at = None
        _error = None
        _step_count = 0
        return _status_unlocked()


def tick(state: dict[str, Any]) -> dict[str, Any]:
    global _step_count, _error, _active_id, _active_name, _controller, _started_at
    with _lock:
        if _controller is None:
            return {"idle": True}
        _step_count += 1
        try:
            return _controller.tick(state)
        except Exception as e:
            _error = str(e)
            _active_id = None
            _active_name = None
            _controller = None
            _started_at = None
            raise
