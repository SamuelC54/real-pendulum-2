from __future__ import annotations

import importlib
import pkgutil
from typing import Any, Callable, Protocol

_SKIP_MODULES = frozenset({"registry", "service", "base"})


class RailController(Protocol):
    def tick(self, state: dict[str, Any]) -> dict[str, Any]: ...


def _iter_controller_modules():
    import controllers as package

    for info in pkgutil.iter_modules(package.__path__, package.__name__ + "."):
        short = info.name.rsplit(".", 1)[-1]
        if short.startswith("_") or short in _SKIP_MODULES:
            continue
        yield info.name


def list_metadata() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for mod_name in sorted(_iter_controller_modules()):
        mod = importlib.import_module(mod_name)
        meta = getattr(mod, "METADATA", None)
        if not isinstance(meta, dict) or "id" not in meta:
            continue
        out.append(
            {
                "id": str(meta["id"]),
                "name": str(meta.get("name", meta["id"])),
                "description": str(meta.get("description", "")),
                "defaultParams": dict(meta.get("defaultParams") or {}),
            }
        )
    return out


def create_controller(controller_id: str, params: dict[str, Any]) -> RailController:
    for mod_name in _iter_controller_modules():
        mod = importlib.import_module(mod_name)
        meta = getattr(mod, "METADATA", None)
        if not isinstance(meta, dict) or meta.get("id") != controller_id:
            continue
        factory: Callable[[dict[str, Any]], RailController] | None = getattr(mod, "create", None)
        if factory is None:
            raise ValueError(f"Controller module {mod_name} has no create() factory.")
        return factory(params)
    raise ValueError(f"Unknown controller id: {controller_id}")
