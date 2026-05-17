"""SciPy twin-parameter calibration against recorded telemetry."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.optimize import minimize

from .replay import replay_twin_trace

MIN_CALIBRATION_SAMPLES = 12
MAX_SAMPLES_FOR_FIT = 96

_BOUNDS = {
    "mpsPerRpm": (1e-9, 0.02),
    "pendulumLengthM": (0.08, 1.5),
    "cartVelocityTrackingPerSec": (1.0, 60.0),
    "angularDampingPerSec": (0.0, 3.0),
}


def _clamp(params: dict[str, float]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key, (lo, hi) in _BOUNDS.items():
        out[key] = max(lo, min(hi, float(params[key])))
    return out


def _subsample(samples: list[dict[str, Any]], max_n: int) -> list[dict[str, Any]]:
    if len(samples) <= max_n:
        return samples
    out: list[dict[str, Any]] = []
    for i in range(max_n):
        idx = round(i * (len(samples) - 1) / (max_n - 1))
        out.append(samples[idx])
    return out


def _params_to_x(params: dict[str, float]) -> np.ndarray:
    return np.array(
        [
            math.log10(params["mpsPerRpm"]),
            params["pendulumLengthM"],
            params["cartVelocityTrackingPerSec"],
            params["angularDampingPerSec"],
        ],
        dtype=float,
    )


def _x_to_params(x: np.ndarray) -> dict[str, float]:
    return _clamp(
        {
            "mpsPerRpm": 10.0 ** float(x[0]),
            "pendulumLengthM": float(x[1]),
            "cartVelocityTrackingPerSec": float(x[2]),
            "angularDampingPerSec": float(x[3]),
        }
    )


def _x_bounds() -> list[tuple[float, float]]:
    lo_mps, hi_mps = _BOUNDS["mpsPerRpm"]
    return [
        (math.log10(lo_mps), math.log10(hi_mps)),
        _BOUNDS["pendulumLengthM"],
        _BOUNDS["cartVelocityTrackingPerSec"],
        _BOUNDS["angularDampingPerSec"],
    ]


def calibration_score(
    samples: list[dict[str, Any]],
    params: dict[str, float],
    weights: dict[str, float],
    defaults: dict[str, float],
) -> float:
    trace = replay_twin_trace(
        samples,
        params,
        gravity=float(defaults["gravity"]),
        encoder_ticks_per_radian=float(defaults["encoderTicksPerRadian"]),
        limit_left_x_m=float(defaults["limitLeftXM"]),
        limit_right_x_m=float(defaults["limitRightXM"]),
    )
    pos_deltas: list[float] = []
    enc_deltas: list[float] = []
    for sample, point in zip(samples, trace):
        if sample.get("realMotorCm") is not None:
            pos_deltas.append(float(sample["realMotorCm"]) - point.motor_cm)
        enc_deltas.append(float(sample["realEncoderTicks"]) - point.encoder_ticks)

    def mean_abs(vals: list[float]) -> float:
        return sum(abs(v) for v in vals) / len(vals) if vals else 0.0

    mean_abs_position_cm = mean_abs(pos_deltas) if pos_deltas else None
    mean_abs_encoder = mean_abs(enc_deltas)
    position_w = float(weights.get("position", 1.0))
    encoder_w = float(weights.get("encoder", 0.5))
    return (mean_abs_position_cm or 0.0) * position_w + mean_abs_encoder * encoder_w


def estimate_mps_per_rpm_from_travel(
    samples: list[dict[str, Any]],
    params: dict[str, float],
    defaults: dict[str, float],
) -> float:
    """Scale mpsPerRpm so replayed cart travel matches recorded travel."""
    trace = replay_twin_trace(
        samples,
        params,
        gravity=float(defaults["gravity"]),
        encoder_ticks_per_radian=float(defaults["encoderTicksPerRadian"]),
        limit_left_x_m=float(defaults["limitLeftXM"]),
        limit_right_x_m=float(defaults["limitRightXM"]),
    )
    real_travel = 0.0
    sim_travel = 0.0
    for i in range(1, len(samples)):
        a = samples[i - 1]
        b = samples[i]
        ta = trace[i - 1]
        tb = trace[i]
        if a.get("realMotorCm") is not None and b.get("realMotorCm") is not None:
            real_travel += abs(float(b["realMotorCm"]) - float(a["realMotorCm"]))
        if ta and tb:
            sim_travel += abs(tb.motor_cm - ta.motor_cm)
    if sim_travel < 1e-9 or real_travel < 1e-9:
        return float(params["mpsPerRpm"])
    scaled = float(params["mpsPerRpm"]) * (real_travel / sim_travel)
    return _clamp({**params, "mpsPerRpm": scaled})["mpsPerRpm"]


def fit_twin_calibration_params(
    samples: list[dict[str, Any]],
    start: dict[str, float],
    weights: dict[str, float],
    defaults: dict[str, float],
) -> dict[str, Any] | None:
    """
    Fit sim parameters on a telemetry window using MuJoCo replay loss.
    Robot commands are fixed; only the digital twin parameters change.
    """
    if len(samples) < MIN_CALIBRATION_SAMPLES:
        return None
    if not any(s.get("realMotorCm") is not None for s in samples):
        return None

    window = _subsample(samples, MAX_SAMPLES_FOR_FIT)
    current = _clamp(start)
    current["mpsPerRpm"] = estimate_mps_per_rpm_from_travel(window, current, defaults)
    x0 = _params_to_x(current)

    def objective(x: np.ndarray) -> float:
        trial = _x_to_params(x)
        return calibration_score(window, trial, weights, defaults)

    result = minimize(
        objective,
        x0,
        method="L-BFGS-B",
        bounds=_x_bounds(),
        options={"maxiter": 120, "ftol": 1e-10},
    )

    best = _x_to_params(result.x)
    score = calibration_score(window, best, weights, defaults)
    return {"params": best, "score": score}
