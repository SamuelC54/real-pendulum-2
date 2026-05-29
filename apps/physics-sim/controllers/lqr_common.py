"""Shared LQR design helpers (MuJoCo linearization + discrete-time gain)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import mujoco
import numpy as np
import scipy.linalg

_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "cart_pendulum.xml"

UPRIGHT_THETA_RAD = float(np.pi)


def load_lqr_position_model() -> tuple[mujoco.MjModel, mujoco.MjData]:
    """Shared plant XML; implicitfast required for mjd_transitionFD (RK4 is not supported)."""
    model = mujoco.MjModel.from_xml_path(str(_MODEL_PATH))
    model.opt.integrator = mujoco.mjtIntegrator.mjINT_IMPLICITFAST
    data = mujoco.MjData(model)
    return model, data


def upright_setpoint(model: mujoco.MjModel, data: mujoco.MjData) -> tuple[np.ndarray, np.ndarray]:
    """Goal pose (qpos0) and baseline cart position setpoint ctrl0 (m)."""
    key_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, "upright_0deg")
    mujoco.mj_resetDataKeyframe(model, data, key_id)
    qpos0 = data.qpos.copy()
    cart_adr = model.joint("cart_slide").qposadr[0]
    ctrl0 = np.array([float(qpos0[cart_adr])], dtype=np.float64)
    return qpos0, ctrl0


def compute_lqr_gain(
    model: mujoco.MjModel,
    data: mujoco.MjData,
    qpos0: np.ndarray,
    ctrl0: np.ndarray,
    q_diag: tuple[float, float, float, float],
    r_scale: float,
    fd_epsilon: float = 1e-6,
) -> np.ndarray:
    """Discrete-time LQR gain K (1 × 4): ctrl = ctrl0 - K @ dx."""
    nv = model.nv
    Q = np.diag(list(q_diag))
    R = float(r_scale) * np.eye(1)

    mujoco.mj_resetData(model, data)
    data.qpos[:] = qpos0
    data.qvel[:] = 0
    data.ctrl[:] = ctrl0

    A = np.zeros((2 * nv, 2 * nv))
    B = np.zeros((2 * nv, model.nu))
    mujoco.mjd_transitionFD(model, data, fd_epsilon, True, A, B, None, None)

    P = scipy.linalg.solve_discrete_are(A, B, Q, R)
    return np.linalg.inv(R + B.T @ P @ B) @ B.T @ P @ A


def build_state_error(
    model: mujoco.MjModel,
    qpos0: np.ndarray,
    cart_m: float,
    theta_rad: float,
    cart_vel_mps: float,
    pend_vel_rps: float,
) -> np.ndarray:
    """dx = [cart pos error, pendulum angle error, cart vel, pend vel] vs upright goal."""
    qpos = np.array([cart_m, theta_rad], dtype=np.float64)
    dq = np.zeros(model.nv, dtype=np.float64)
    mujoco.mj_differentiatePos(model, dq, 1.0, qpos0, qpos)
    return np.hstack((dq, np.array([cart_vel_mps, pend_vel_rps], dtype=np.float64)))


def encoder_ticks_to_theta_rad(encoder_ticks: float, ticks_per_radian: float) -> float:
    return float(encoder_ticks) / float(ticks_per_radian)
