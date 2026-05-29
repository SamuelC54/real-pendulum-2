"""Oscillate the cart left and right with absolute position moves."""

from __future__ import annotations

from typing import Any

METADATA = {
    "id": "oscillate_position",
    "name": "Oscillate position",
    "description": (
        "Moves the cart back and forth by a fixed distance (cm) from the position "
        "when you press Start. Uses Teknic absolute profile moves."
    ),
    "defaultParams": {
        "amplitudeCm": 5.0,
        "toleranceCm": 0.35,
        "dwellSec": 0.8,
        "maxVelocityRpm": 80.0,
        "maxAccelerationRpmPerSec": 500.0,
    },
}


class OscillatePositionController:
    def __init__(self, params: dict[str, Any]) -> None:
        defaults = METADATA["defaultParams"]
        self.amplitude_cm = float(params.get("amplitudeCm", defaults["amplitudeCm"]))
        self.tolerance_cm = float(params.get("toleranceCm", defaults["toleranceCm"]))
        self.dwell_sec = float(params.get("dwellSec", defaults["dwellSec"]))
        self.max_velocity_rpm = float(params.get("maxVelocityRpm", defaults["maxVelocityRpm"]))
        self.max_accel = float(
            params.get("maxAccelerationRpmPerSec", defaults["maxAccelerationRpmPerSec"])
        )

        self._center_cm: float | None = None
        self._target_cm: float | None = None
        self._phase = "init"
        self._dwell_until: float | None = None

    def tick(self, state: dict[str, Any]) -> dict[str, Any]:
        pos = float(state["positionCm"])
        now = float(state["timeSec"])

        if self._phase == "init":
            self._center_cm = pos
            self._target_cm = pos - self.amplitude_cm
            self._phase = "moving"
            self._dwell_until = None
            return self._move_cmd()

        if self._phase != "moving" or self._target_cm is None or self._center_cm is None:
            return {}

        if abs(pos - self._target_cm) > self.tolerance_cm:
            return {}

        if self._dwell_until is None:
            self._dwell_until = now + self.dwell_sec
            return {}

        if now < self._dwell_until:
            return {}

        if self._target_cm <= self._center_cm:
            self._target_cm = self._center_cm + self.amplitude_cm
        else:
            self._target_cm = self._center_cm - self.amplitude_cm
        self._dwell_until = None
        return self._move_cmd()

    def _move_cmd(self) -> dict[str, Any]:
        return {
            "positionCm": self._target_cm,
            "maxVelocityRpm": self.max_velocity_rpm,
            "maxAccelerationRpmPerSec": self.max_accel,
        }


def create(params: dict[str, Any]) -> OscillatePositionController:
    return OscillatePositionController(params)
