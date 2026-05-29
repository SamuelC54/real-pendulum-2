import numpy as np

from controllers.lqr_common import (
    build_state_error,
    compute_lqr_gain,
    load_lqr_position_model,
    upright_setpoint,
)
from controllers.lqr_position import METADATA, create


def test_lqr_gain_shape():
    model, data = load_lqr_position_model()
    qpos0, ctrl0 = upright_setpoint(model, data)
    q_diag = tuple(METADATA["defaultParams"][k] for k in ("qCart", "qPendulum", "qCartVel", "qPendulumVel"))
    K = compute_lqr_gain(model, data, qpos0, ctrl0, q_diag, r_scale=0.05)
    assert K.shape == (1, 4)


def test_lqr_position_clips_to_bounds():
    ctrl = create({"targetClipMinCm": -10.0, "targetClipMaxCm": 10.0})
    # Large pendulum angle error would command a huge cart move without clip.
    ctrl._K = np.array([[0.0, 1000.0, 0.0, 0.0]])
    out = ctrl.tick(
        {
            "positionCm": 0.0,
            "encoderTicks": 0.0,
            "timeSec": 0.0,
        }
    )
    assert out["positionCm"] == 10.0


def test_lqr_position_tick_commands_setpoint():
    ctrl = create({})
    out = ctrl.tick(
        {
            "positionCm": 0.0,
            "encoderTicks": float(np.pi * ctrl.ticks_per_rad),
            "timeSec": 0.0,
        }
    )
    assert "positionCm" in out
    assert out.get("streamPosition") is True


def test_list_includes_lqr_position():
    from controllers.registry import list_metadata

    ids = {m["id"] for m in list_metadata()}
    assert "lqr_position" in ids


def test_build_state_error_near_upright_small():
    model, data = load_lqr_position_model()
    qpos0, _ = upright_setpoint(model, data)
    dx = build_state_error(model, qpos0, 0.0, float(np.pi), 0.0, 0.0)
    assert dx.shape == (4,)
    assert np.linalg.norm(dx) < 0.01
