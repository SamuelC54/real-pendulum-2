"""Replay commanded RPM through the plant (twin calibration / validation)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .plant import CartPendulumPlant, PlantConfig, PlantState


@dataclass
class ReplayPoint:
    motor_cm: float
    encoder_ticks: int


def _motor_cm_to_xm(cm: float) -> float:
    return cm / 100.0


def _motor_xm_to_cm(x_m: float) -> float:
    return x_m * 100.0


def replay_twin_trace(
    samples: list[dict[str, Any]],
    params: dict[str, float],
    *,
    gravity: float,
    encoder_ticks_per_radian: float,
    limit_left_x_m: float,
    limit_right_x_m: float,
) -> list[ReplayPoint]:
    if not samples:
        return []

    start_idx = next((i for i, s in enumerate(samples) if s.get("realMotorCm") is not None), -1)
    if start_idx < 0:
        return [ReplayPoint(0.0, 0) for _ in samples]

    plant_cfg = PlantConfig(
        gravity=gravity,
        pendulum_length_m=float(params["pendulumLengthM"]),
        cart_velocity_tracking_per_sec=float(params["cartVelocityTrackingPerSec"]),
        angular_damping_per_sec=float(params["angularDampingPerSec"]),
        encoder_ticks_per_radian=encoder_ticks_per_radian,
    )
    plant = CartPendulumPlant(config=plant_cfg)
    _init_from_sample(plant, samples, start_idx, encoder_ticks_per_radian)

    mps_per_rpm = float(params["mpsPerRpm"])
    out: list[ReplayPoint] = []

    for i, cur in enumerate(samples):
        if i > 0:
            prev = samples[i - 1]
            dt = (float(cur["t"]) - float(prev["t"])) / 1000.0
            if dt > 0:
                plant.state.v_cmd_mps = -float(cur.get("commandedRpm", 0)) * mps_per_rpm
                _enforce_limits(plant, limit_left_x_m, limit_right_x_m)
                plant.step(dt)
                _enforce_limits(plant, limit_left_x_m, limit_right_x_m)
        elif i < start_idx:
            enc0 = int(samples[0].get("realEncoderTicks", 0))
            out.append(ReplayPoint(0.0, enc0))
            continue

        out.append(
            ReplayPoint(
                _motor_xm_to_cm(plant.state.x_m),
                plant.encoder_ticks_int(),
            )
        )

    return out


def _init_from_sample(
    plant: CartPendulumPlant,
    samples: list[dict[str, Any]],
    start_idx: int,
    tpr: float,
) -> None:
    s0 = samples[start_idx]
    plant.state.x_m = _motor_cm_to_xm(float(s0["realMotorCm"]))
    plant.state.encoder_ticks_float = float(s0.get("realEncoderTicks", 0))
    plant.state.theta_rad = plant.state.encoder_ticks_float / tpr
    plant.state.omega_rps = 0.0
    plant.state.v_mps = 0.0
    plant.state.v_cmd_mps = 0.0

    if start_idx + 1 >= len(samples):
        plant.sync_state_to_mujoco()
        return

    s1 = samples[start_idx + 1]
    dt = (float(s1["t"]) - float(s0["t"])) / 1000.0
    if dt > 1e-6:
        plant.state.omega_rps = (float(s1.get("realEncoderTicks", 0)) - plant.state.encoder_ticks_float) / dt / tpr
        if s1.get("realMotorCm") is not None:
            plant.state.v_mps = (_motor_cm_to_xm(float(s1["realMotorCm"])) - plant.state.x_m) / dt
    plant.sync_state_to_mujoco()


def _enforce_limits(plant: CartPendulumPlant, left_x: float, right_x: float) -> None:
    x = plant.state.x_m
    if x <= left_x and plant.state.v_cmd_mps < 0:
        plant.state.v_cmd_mps = 0.0
    if x >= right_x and plant.state.v_cmd_mps > 0:
        plant.state.v_cmd_mps = 0.0
