"""Generation checkpoints under ``rl/gen/<n>/``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RL_ROOT = Path(__file__).resolve().parent
GEN_DIR = RL_ROOT / "gen"


def generation_dir(generation: int) -> Path:
    return GEN_DIR / str(generation)


def generation_model_path(generation: int) -> Path:
    return generation_dir(generation) / "model.zip"


def generation_meta_path(generation: int) -> Path:
    return generation_dir(generation) / "meta.json"


def list_generations() -> list[int]:
    if not GEN_DIR.is_dir():
        return []
    out: list[int] = []
    for p in GEN_DIR.iterdir():
        if p.is_dir() and p.name.isdigit() and generation_model_path(int(p.name)).is_file():
            out.append(int(p.name))
    return sorted(out)


def latest_generation() -> int | None:
    gens = list_generations()
    return gens[-1] if gens else None


def save_generation(
    generation: int,
    model_path: Path,
    meta: dict[str, Any],
) -> Path:
    dest = generation_dir(generation)
    dest.mkdir(parents=True, exist_ok=True)
    target = generation_model_path(generation)
    if model_path.resolve() != target.resolve():
        target.write_bytes(model_path.read_bytes())
    generation_meta_path(generation).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return target


def load_meta(generation: int) -> dict[str, Any]:
    path = generation_meta_path(generation)
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
