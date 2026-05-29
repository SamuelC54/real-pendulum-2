"""
Cart–pendulum LQR with a cart position setpoint (same law as notebooks/LQR-pendulum-position.ipynb).

Requires motor position (cm) and pendulum encoder ticks each tick.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from .lqr_common import (
    build_state_error,
    compute_lqr_gain,
    encoder_ticks_to_theta_rad,
    load_lqr_position_model,
    upright_setpoint,
)

METADATA = {
    "id": "lqr_position",
    "name": "LQR balance (position)",
    "description": (
        "Discrete LQR around upright: linearizes the MuJoCo cart–pendulum (position actuator), "
        "then commands cart position setpoints from motor + encoder feedback. "
        "Connect the sensor board; works best for small tilts near upright."
    ),
    "defaultParams": {
        "qCart": 500.0,
        "qPendulum": 100.0,
        "qCartVel": 1.0,
        "qPendulumVel": 10.0,
        "rScale": 0.05,
        "encoderTicksPerRadian": 2400.0 / (2.0 * math.pi),
        "minCommandDeltaCm": 0.05,
        "targetClipMinCm": -100.0,
        "targetClipMaxCm": 100.0,
        "maxVelocityRpm": 120.0,
        "maxAccelerationRpmPerSec": 800.0,
    },
    "paramLabels": {
        "qCart": "Q: cart position",
        "qPendulum": "Q: pendulum angle",
        "qCartVel": "Q: cart velocity",
        "qPendulumVel": "Q: pendulum rate",
        "rScale": "R scale",
        "encoderTicksPerRadian": "Encoder ticks / rad",
        "minCommandDeltaCm": "Min command step (cm)",
        "targetClipMinCm": "Target clip min (cm)",
        "targetClipMaxCm": "Target clip max (cm)",
        "maxVelocityRpm": "Max profile RPM",
        "maxAccelerationRpmPerSec": "Max acceleration (RPM/s)",
    },
    "paramDescriptions": {
        "qCart": "State cost on cart position error (m). Higher pulls the cart harder toward center.",
        "qPendulum": "State cost on pendulum angle error (rad). Usually the most important term for balance.",
        "qCartVel": "State cost on cart velocity. Dampens oscillation of the cart target.",
        "qPendulumVel": "State cost on pendulum angular rate. Dampens wobble.",
        "rScale": "Control cost on moving the position setpoint. Higher = gentler, smaller cart commands.",
        "encoderTicksPerRadian": "Converts raw encoder ticks to hinge angle (rad). Match your sensor calibration.",
        "minCommandDeltaCm": "Only send a new absolute move when the setpoint changes by at least this much.",
        "targetClipMinCm": "Lower limit on commanded cart position (cm), same role as notebook ctrlrange low.",
        "targetClipMaxCm": "Upper limit on commanded cart position (cm), same role as notebook ctrlrange high.",
        "maxVelocityRpm": "Cap on Teknic profile speed for each absolute move.",
        "maxAccelerationRpmPerSec": "Cap on Teknic profile acceleration for each absolute move.",
    },
    "paramOrder": [
        "qCart",
        "qPendulum",
        "qCartVel",
        "qPendulumVel",
        "rScale",
        "targetClipMinCm",
        "targetClipMaxCm",
        "minCommandDeltaCm",
        "encoderTicksPerRadian",
        "maxVelocityRpm",
        "maxAccelerationRpmPerSec",
    ],
}


class LqrPositionController:
    def __init__(self, params: dict[str, Any]) -> None:
        defaults = METADATA["defaultParams"]
        q_diag = (
            float(params.get("qCart", defaults["qCart"])),
            float(params.get("qPendulum", defaults["qPendulum"])),
            float(params.get("qCartVel", defaults["qCartVel"])),
            float(params.get("qPendulumVel", defaults["qPendulumVel"])),
        )
        r_scale = float(params.get("rScale", defaults["rScale"]))
        self.ticks_per_rad = float(
            params.get("encoderTicksPerRadian", defaults["encoderTicksPerRadian"])
        )
        self.min_command_delta_cm = float(
            params.get("minCommandDeltaCm", defaults["minCommandDeltaCm"])
        )
        self.max_velocity_rpm = float(params.get("maxVelocityRpm", defaults["maxVelocityRpm"]))
        self.max_accel = float(
            params.get("maxAccelerationRpmPerSec", defaults["maxAccelerationRpmPerSec"])
        )

        self._model, self._data = load_lqr_position_model()
        self._qpos0, self._ctrl0 = upright_setpoint(self._model, self._data)
        self._K = compute_lqr_gain(
            self._model, self._data, self._qpos0, self._ctrl0, q_diag, r_scale
        )

        self._target_min_cm = float(params.get("targetClipMinCm", defaults["targetClipMinCm"]))
        self._target_max_cm = float(params.get("targetClipMaxCm", defaults["targetClipMaxCm"]))
        if self._target_min_cm >= self._target_max_cm:
            raise ValueError("targetClipMinCm must be less than targetClipMaxCm.")

        self._prev: dict[str, float] | None = None
        self._last_target_cm: float | None = None

    def tick(self, state: dict[str, Any]) -> dict[str, Any]:
        if "encoderTicks" not in state:
            raise ValueError("encoderTicks required — connect the sensor board on the Control tab.")

        position_cm = float(state["positionCm"])
        encoder_ticks = float(state["encoderTicks"])
        time_sec = float(state.get("timeSec", 0.0))

        cart_m = position_cm / 100.0
        theta_rad = encoder_ticks_to_theta_rad(encoder_ticks, self.ticks_per_rad)

        cart_vel = 0.0
        pend_vel = 0.0
        if self._prev is not None:
            dt = max(1e-6, time_sec - self._prev["timeSec"])
            cart_vel = (cart_m - self._prev["cartM"]) / dt
            pend_vel = (theta_rad - self._prev["thetaRad"]) / dt

        self._prev = {
            "timeSec": time_sec,
            "cartM": cart_m,
            "thetaRad": theta_rad,
        }

        dx = build_state_error(
            self._model,
            self._qpos0,
            cart_m,
            theta_rad,
            cart_vel,
            pend_vel,
        )
        target_m = float((self._ctrl0 - self._K @ dx).squeeze())
        target_cm = float(np.clip(target_m * 100.0, self._target_min_cm, self._target_max_cm))

        if (
            self._last_target_cm is not None
            and abs(target_cm - self._last_target_cm) < self.min_command_delta_cm
        ):
            return {"streamPosition": True}

        self._last_target_cm = target_cm
        return {
            "positionCm": target_cm,
            "streamPosition": True,
            "minCommandDeltaCm": self.min_command_delta_cm,
            "maxVelocityRpm": self.max_velocity_rpm,
            "maxAccelerationRpmPerSec": self.max_accel,
        }


def create(params: dict[str, Any]) -> LqrPositionController:
    return LqrPositionController(params)
