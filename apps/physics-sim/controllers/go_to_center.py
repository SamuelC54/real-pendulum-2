"""Move the cart to rail center (0 cm / Teknic home origin) and stop."""

from __future__ import annotations

from typing import Any

METADATA = {
    "id": "go_to_center",
    "name": "Go to center",
    "description": (
        "Absolute profile move to rail center (0 cm). Stops automatically when the cart "
        "is within tolerance of the target — same destination as Move to home on the Control tab."
    ),
    "defaultParams": {
        "centerCm": 0.0,
        "toleranceCm": 0.35,
        "maxVelocityRpm": 80.0,
        "maxAccelerationRpmPerSec": 500.0,
    },
    "paramLabels": {
        "centerCm": "Target center (cm)",
        "toleranceCm": "Arrival tolerance (cm)",
        "maxVelocityRpm": "Max profile RPM",
        "maxAccelerationRpmPerSec": "Max acceleration (RPM/s)",
    },
    "paramDescriptions": {
        "centerCm": "Goal rail position (usually 0 cm / Teknic home).",
        "toleranceCm": "Stop the controller when the cart is within this distance of the target.",
        "maxVelocityRpm": "Cap on Teknic profile speed for the move.",
        "maxAccelerationRpmPerSec": "Cap on Teknic profile acceleration for the move.",
    },
    "paramOrder": ["centerCm", "toleranceCm", "maxVelocityRpm", "maxAccelerationRpmPerSec"],
}


class GoToCenterController:
    def __init__(self, params: dict[str, Any]) -> None:
        defaults = METADATA["defaultParams"]
        self.center_cm = float(params.get("centerCm", defaults["centerCm"]))
        self.tolerance_cm = float(params.get("toleranceCm", defaults["toleranceCm"]))
        self.max_velocity_rpm = float(params.get("maxVelocityRpm", defaults["maxVelocityRpm"]))
        self.max_accel = float(
            params.get("maxAccelerationRpmPerSec", defaults["maxAccelerationRpmPerSec"])
        )
        self._issued_move = False

    def tick(self, state: dict[str, Any]) -> dict[str, Any]:
        pos = float(state["positionCm"])

        if abs(pos - self.center_cm) <= self.tolerance_cm:
            return {"done": True}

        if not self._issued_move:
            self._issued_move = True
            return {
                "positionCm": self.center_cm,
                "maxVelocityRpm": self.max_velocity_rpm,
                "maxAccelerationRpmPerSec": self.max_accel,
            }

        return {}


def create(params: dict[str, Any]) -> GoToCenterController:
    return GoToCenterController(params)
