import pytest

from cart_pendulum.calibrate import (
    estimate_mps_per_rpm_from_travel,
    fit_twin_calibration_params,
)
from cart_pendulum.replay import replay_twin_trace

TRUE_PARAMS = {
    "mpsPerRpm": 6e-5,
    "pendulumLengthM": 0.3,
    "cartVelocityTrackingPerSec": 12.0,
    "angularDampingPerSec": 0.1,
}

DEFAULTS = {
    "gravity": 9.80665,
    "encoderTicksPerRadian": 2400.0 / (2.0 * 3.141592653589793),
    "limitLeftXM": -0.2,
    "limitRightXM": 0.2,
}

WEIGHTS = {"position": 1.0, "encoder": 0.5}


def _replay_kwargs() -> dict[str, float]:
    return {
        "gravity": DEFAULTS["gravity"],
        "encoder_ticks_per_radian": DEFAULTS["encoderTicksPerRadian"],
        "limit_left_x_m": DEFAULTS["limitLeftXM"],
        "limit_right_x_m": DEFAULTS["limitRightXM"],
    }


def _synthesize_samples(params: dict[str, float], n: int, rpm: float) -> list[dict]:
    template = [
        {
            "t": i * 50,
            "commandedRpm": rpm,
            "realMotorCm": 0.0,
            "realEncoderTicks": 0,
        }
        for i in range(n)
    ]
    trace = replay_twin_trace(template, params, **_replay_kwargs())
    out = []
    for i, s in enumerate(template):
        p = trace[i]
        out.append(
            {
                **s,
                "realMotorCm": p.motor_cm,
                "realEncoderTicks": p.encoder_ticks,
            }
        )
    return out


def test_estimate_mps_per_rpm_from_travel_scales_toward_true():
    samples = _synthesize_samples(TRUE_PARAMS, 20, 60.0)
    wrong = {**TRUE_PARAMS, "mpsPerRpm": 4e-5}
    est = estimate_mps_per_rpm_from_travel(samples, wrong, DEFAULTS)
    assert est > wrong["mpsPerRpm"]
    assert est == pytest.approx(TRUE_PARAMS["mpsPerRpm"], rel=0.05)


def test_fit_twin_calibration_params_improves_score():
    samples = _synthesize_samples(TRUE_PARAMS, 24, 80.0)
    guess = {**TRUE_PARAMS, "mpsPerRpm": 4e-5}
    fit = fit_twin_calibration_params(samples, guess, WEIGHTS, DEFAULTS)
    assert fit is not None
    assert fit["score"] < 0.5
