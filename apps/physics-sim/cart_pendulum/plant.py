"""MuJoCo cart–pendulum plant (matches coupled-sim telemetry conventions)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import math

import mujoco

_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "cart_pendulum.xml"

_JOINT_CART = "cart_slide"
_JOINT_PENDULUM = "pendulum_hinge"
_ACT_CART = "cart_vel"
_GEOM_BOB = "bob"


@dataclass
class PlantConfig:
    gravity: float = 9.80665
    pendulum_length_m: float = 0.35
    cart_velocity_tracking_per_sec: float = 12.0
    angular_damping_per_sec: float = 0.04
    encoder_ticks_per_radian: float = 2400.0 / (2.0 * math.pi)
    max_internal_step_sec: float = 1.0 / 240.0


@dataclass
class PlantState:
    x_m: float = 0.0
    v_mps: float = 0.0
    theta_rad: float = 0.05
    omega_rps: float = 0.0
    v_cmd_mps: float = 0.0
    encoder_ticks_float: float = 0.0


@dataclass
class CartPendulumPlant:
    config: PlantConfig = field(default_factory=PlantConfig)
    state: PlantState = field(default_factory=PlantState)
    _model: mujoco.MjModel = field(init=False, repr=False)
    _data: mujoco.MjData = field(init=False, repr=False)
    _cart_qpos: int = field(init=False, repr=False)
    _cart_qvel: int = field(init=False, repr=False)
    _pend_qpos: int = field(init=False, repr=False)
    _pend_qvel: int = field(init=False, repr=False)
    _act_id: int = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._rebuild_model()

    def _rebuild_model(self) -> None:
        self._model = mujoco.MjModel.from_xml_path(str(_MODEL_PATH))
        self._data = mujoco.MjData(self._model)
        self._cart_qpos = self._model.joint(_JOINT_CART).qposadr[0]
        self._cart_qvel = self._model.joint(_JOINT_CART).dofadr[0]
        self._pend_qpos = self._model.joint(_JOINT_PENDULUM).qposadr[0]
        self._pend_qvel = self._model.joint(_JOINT_PENDULUM).dofadr[0]
        self._act_id = self._model.actuator(_ACT_CART).id
        self._apply_config_to_model()
        self.sync_state_to_mujoco()

    def _apply_config_to_model(self) -> None:
        cfg = self.config
        self._model.opt.gravity[:] = (0.0, 0.0, -cfg.gravity)
        self._model.opt.timestep = max(1e-6, cfg.max_internal_step_sec)
        self._model.actuator_gainprm[self._act_id, 0] = cfg.cart_velocity_tracking_per_sec
        self._model.dof_damping[self._pend_qvel] = cfg.angular_damping_per_sec
        length = max(0.08, cfg.pendulum_length_m)
        bob_gid = self._model.geom(_GEOM_BOB).id
        self._model.geom_pos[bob_gid, 2] = -length

    def sync_state_to_mujoco(self) -> None:
        s = self.state
        self._data.qpos[self._cart_qpos] = s.x_m
        self._data.qvel[self._cart_qvel] = s.v_mps
        self._data.qpos[self._pend_qpos] = s.theta_rad
        self._data.qvel[self._pend_qvel] = s.omega_rps
        self._data.ctrl[self._act_id] = s.v_cmd_mps
        mujoco.mj_forward(self._model, self._data)

    def sync_state_from_mujoco(self) -> None:
        s = self.state
        s.x_m = float(self._data.qpos[self._cart_qpos])
        s.v_mps = float(self._data.qvel[self._cart_qvel])
        s.theta_rad = float(self._data.qpos[self._pend_qpos])
        s.omega_rps = float(self._data.qvel[self._pend_qvel])

    def patch_config(self, patch: dict) -> None:
        mapping = {
            "gravity": "gravity",
            "pendulumLengthM": "pendulum_length_m",
            "cartVelocityTrackingPerSec": "cart_velocity_tracking_per_sec",
            "angularDampingPerSec": "angular_damping_per_sec",
            "encoderTicksPerRadian": "encoder_ticks_per_radian",
            "maxInternalStepSec": "max_internal_step_sec",
        }
        for key, attr in mapping.items():
            if key in patch and patch[key] is not None:
                setattr(self.config, attr, float(patch[key]))
        self._apply_config_to_model()

    def step(self, dt_sec: float) -> None:
        if not (dt_sec > 0) or not math.isfinite(dt_sec):
            return
        cfg = self.config
        h_max = max(1e-6, cfg.max_internal_step_sec)
        remaining = dt_sec
        self._data.ctrl[self._act_id] = self.state.v_cmd_mps
        omega_prev = self.state.omega_rps
        while remaining > 1e-12:
            h = min(h_max, remaining)
            self._model.opt.timestep = h
            mujoco.mj_step(self._model, self._data)
            remaining -= h
        self.sync_state_from_mujoco()
        omega_mid = 0.5 * (omega_prev + self.state.omega_rps)
        self.state.encoder_ticks_float += omega_mid * dt_sec * cfg.encoder_ticks_per_radian

    def encoder_ticks_int(self) -> int:
        return int(round(self.state.encoder_ticks_float))
