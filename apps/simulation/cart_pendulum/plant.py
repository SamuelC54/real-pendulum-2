"""MuJoCo cart–pendulum plant (matches simulation telemetry conventions)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import math

import mujoco

_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "cart_pendulum.xml"

_JOINT_CART = "cart_slide"
_JOINT_PENDULUM = "pendulum_hinge"
_ACT_CART = "cart_pos"
_GEOM_BOB = "bob"

# Maps legacy cartVelocityTrackingPerSec (≈1–60) to position servo kp.
_CART_KP_PER_TRACKING_UNIT = 100.0
_CART_KV_RATIO = 0.1
_CART_KP_MAX = 5000.0

_V_CMD_ZERO_EPS = 1e-9
_TOUCH_FORCE_EPS = 1e-6
_BODY_LIMIT_LEFT = "limit_switch_left"
_BODY_LIMIT_RIGHT = "limit_switch_right"
_SENSOR_LIMIT_LEFT = "limit_left_touch"
_SENSOR_LIMIT_RIGHT = "limit_right_touch"


@dataclass
class PlantConfig:
    """Defaults mirror `config.sim.plant` in packages/app-config/src/config.ts."""

    gravity: float = 9.80665
    pendulum_length_m: float = 0.3

    # Scales position actuator kp (×100); higher ≈ stiffer hold / tracking.
    cart_velocity_tracking_per_sec: float = 10.0

    angular_damping_per_sec: float = 0.00003
    encoder_ticks_per_radian: float = 2400.0 / (2.0 * math.pi)
    max_internal_step_sec: float = 1.0 / 240.0

    """World-frame x (m) of left/right limit-switch plates (MuJoCo touch collision)."""
    limit_left_x_m: float = -0.8
    limit_right_x_m: float = 0.8


@dataclass
class PlantState:
    x_m: float = 0.0
    v_mps: float = 0.0

    """Hinge angle (rad); 0 = bob hangs toward −Z (straight down)."""
    theta_rad: float = 0.0

    omega_rps: float = 0.0
    v_cmd_mps: float = 0.0

    """Position setpoint for belt servo (m); integrated from v_cmd while moving."""
    x_ref_m: float = 0.0

    encoder_ticks_float: float = 0.0

    limit_left_pressed: bool = False
    limit_right_pressed: bool = False


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
    _servo_hold_setpoint: bool = field(init=False, repr=False)
    _body_limit_left: int = field(init=False, repr=False)
    _body_limit_right: int = field(init=False, repr=False)
    _sensor_limit_left_adr: int = field(init=False, repr=False)
    _sensor_limit_right_adr: int = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._servo_hold_setpoint = False
        self._rebuild_model()

    def _rebuild_model(self) -> None:
        self._model = mujoco.MjModel.from_xml_path(str(_MODEL_PATH))
        self._data = mujoco.MjData(self._model)

        self._cart_qpos = self._model.joint(_JOINT_CART).qposadr[0]
        self._cart_qvel = self._model.joint(_JOINT_CART).dofadr[0]
        self._pend_qpos = self._model.joint(_JOINT_PENDULUM).qposadr[0]
        self._pend_qvel = self._model.joint(_JOINT_PENDULUM).dofadr[0]
        self._act_id = self._model.actuator(_ACT_CART).id
        self._body_limit_left = self._model.body(_BODY_LIMIT_LEFT).id
        self._body_limit_right = self._model.body(_BODY_LIMIT_RIGHT).id
        self._sensor_limit_left_adr = int(self._model.sensor_adr[self._model.sensor(_SENSOR_LIMIT_LEFT).id])
        self._sensor_limit_right_adr = int(
            self._model.sensor_adr[self._model.sensor(_SENSOR_LIMIT_RIGHT).id]
        )

        self._apply_config_to_model()
        self.sync_state_to_mujoco()

    def _apply_config_to_model(self) -> None:
        cfg = self.config

        self._model.opt.gravity[:] = (0.0, 0.0, -cfg.gravity)
        self._model.opt.timestep = max(1e-6, cfg.max_internal_step_sec)

        kp = min(
            cfg.cart_velocity_tracking_per_sec * _CART_KP_PER_TRACKING_UNIT,
            _CART_KP_MAX,
        )
        kv = max(10.0, kp * _CART_KV_RATIO)

        self._model.actuator_gainprm[self._act_id, 0] = kp
        self._model.actuator_biasprm[self._act_id, 1] = -kp
        self._model.actuator_biasprm[self._act_id, 2] = -kv

        self._model.dof_damping[self._pend_qvel] = cfg.angular_damping_per_sec

        length = max(0.08, cfg.pendulum_length_m)

        rod_gid = self._model.geom("rod").id
        bob_gid = self._model.geom(_GEOM_BOB).id

        self._model.geom_size[rod_gid, 1] = length / 2.0
        self._model.geom_pos[bob_gid, 2] = -length

        self._model.body_pos[self._body_limit_left, 0] = cfg.limit_left_x_m
        self._model.body_pos[self._body_limit_right, 0] = cfg.limit_right_x_m

    def _read_limit_switches_from_mujoco(self) -> None:
        left_force = float(self._data.sensordata[self._sensor_limit_left_adr])
        right_force = float(self._data.sensordata[self._sensor_limit_right_adr])
        self.state.limit_left_pressed = left_force > _TOUCH_FORCE_EPS
        self.state.limit_right_pressed = right_force > _TOUCH_FORCE_EPS

    def sync_encoder_from_theta(self) -> None:
        """Quadrature encoder readout tracks MuJoCo hinge angle with no separate integration."""

        self.state.encoder_ticks_float = (
            self.state.theta_rad * self.config.encoder_ticks_per_radian
        )

    def sync_state_to_mujoco(self) -> None:
        s = self.state

        self._data.qpos[self._cart_qpos] = s.x_m
        self._data.qvel[self._cart_qvel] = s.v_mps
        self._data.qpos[self._pend_qpos] = s.theta_rad
        self._data.qvel[self._pend_qvel] = s.omega_rps

        s.x_ref_m = s.x_m
        self._data.ctrl[self._act_id] = s.x_ref_m

        mujoco.mj_forward(self._model, self._data)
        self._read_limit_switches_from_mujoco()
        self.sync_encoder_from_theta()

    def sync_state_from_mujoco(self) -> None:
        s = self.state

        s.x_m = float(self._data.qpos[self._cart_qpos])
        s.v_mps = float(self._data.qvel[self._cart_qvel])
        s.theta_rad = float(self._data.qpos[self._pend_qpos])
        s.omega_rps = float(self._data.qvel[self._pend_qvel])
        self._read_limit_switches_from_mujoco()

    def _advance_cart_setpoint(self, dt_sec: float) -> None:
        s = self.state

        if abs(s.v_cmd_mps) < _V_CMD_ZERO_EPS:
            if not self._servo_hold_setpoint:
                # Compliant hold: track current cart x (pendulum swing does not backdrive).
                s.x_ref_m = float(self._data.qpos[self._cart_qpos])
            self._data.ctrl[self._act_id] = s.x_ref_m
            return

        self._servo_hold_setpoint = False
        s.x_ref_m += s.v_cmd_mps * dt_sec
        self._data.ctrl[self._act_id] = s.x_ref_m

    def move_to_setpoint(
        self,
        target_x_m: float,
        *,
        tolerance_m: float = 0.002,
        max_velocity_mps: float = 0.05,
        max_time_sec: float = 30.0,
    ) -> bool:
        """Drive cart_pos to target via MuJoCo position actuator (no qpos teleport)."""
        s = self.state
        s.v_cmd_mps = 0.0
        s.x_ref_m = float(target_x_m)
        self._servo_hold_setpoint = True

        h = max(1e-6, self.config.max_internal_step_sec)
        elapsed = 0.0

        try:
            while elapsed < max_time_sec:
                x = float(self._data.qpos[self._cart_qpos])
                v = float(self._data.qvel[self._cart_qvel])
                if abs(x - target_x_m) <= tolerance_m and abs(v) <= max_velocity_mps:
                    return True

                self.step(h)
                elapsed += h
        finally:
            self._servo_hold_setpoint = False
            s.x_ref_m = float(self._data.qpos[self._cart_qpos])
            self._data.ctrl[self._act_id] = s.x_ref_m

        return abs(float(self._data.qpos[self._cart_qpos]) - target_x_m) <= tolerance_m

    def patch_config(self, patch: dict) -> None:
        mapping = {
            "gravity": "gravity",
            "pendulumLengthM": "pendulum_length_m",
            "cartVelocityTrackingPerSec": "cart_velocity_tracking_per_sec",
            "angularDampingPerSec": "angular_damping_per_sec",
            "encoderTicksPerRadian": "encoder_ticks_per_radian",
            "maxInternalStepSec": "max_internal_step_sec",
            "limitLeftXM": "limit_left_x_m",
            "limitRightXM": "limit_right_x_m",
        }

        for key, attr in mapping.items():
            if key in patch and patch[key] is not None:
                setattr(self.config, attr, float(patch[key]))

        self._apply_config_to_model()
        mujoco.mj_forward(self._model, self._data)
        self._read_limit_switches_from_mujoco()

    def step(self, dt_sec: float) -> None:
        if not (dt_sec > 0) or not math.isfinite(dt_sec):
            return

        cfg = self.config
        h_max = max(1e-6, cfg.max_internal_step_sec)

        remaining = dt_sec

        while remaining > 1e-12:
            h = min(h_max, remaining)

            self._model.opt.timestep = h
            self._advance_cart_setpoint(h)
            mujoco.mj_step(self._model, self._data)

            remaining -= h

        self.sync_state_from_mujoco()
        self.sync_encoder_from_theta()

    def encoder_ticks_int(self) -> int:
        return int(round(self.state.encoder_ticks_float))
