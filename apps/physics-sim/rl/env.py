"""
Gymnasium environment: motor RPM → ``CartPendulumPlant`` (MuJoCo).

Coordinate conventions (see ``models/cart_pendulum.xml``):
  - Cart slides on +X; pendulum hinge axis is +Y (swing in X–Z).
  - θ = 0: bob hangs toward −Z. θ ≈ π: inverted (balance target).
  - Teknic jog sign: positive RPM → negative ``v_cmd_mps`` (see ``step``).

Task: swing-up, balance upright, center when upright, idle/spin penalties, hard stop at rail limit.

Training uses the same plant as the digital twin (``cart_pendulum/plant.py``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from cart_pendulum.plant import CartPendulumPlant, PlantConfig, PlantState

DEFAULT_MAX_RPM = 1500.0
DEFAULT_MPS_PER_RPM = 0.0007
HANGING_THETA_RAD = 0.0
UPRIGHT_THETA_RAD = math.pi
DEFAULT_HEALTHY_ANGLE_RAD = 0.2


@dataclass
class EnvConfig:
    """Hyperparameters shared by training, inference, and tests."""

    dt_sec: float = 1.0 / 30.0
    max_episode_steps: int = 1000
    max_rpm: float = DEFAULT_MAX_RPM
    mps_per_rpm: float = DEFAULT_MPS_PER_RPM
    gravity: float = 9.80665
    pendulum_length_m: float = 0.35
    cart_velocity_tracking_per_sec: float = 12.0
    angular_damping_per_sec: float = 0.04
    x_limit_m: float = 0.2
    healthy_angle_rad: float = DEFAULT_HEALTHY_ANGLE_RAD
    reset_noise_scale: float = 0.01
    upright_reward: float = 4.0
    swing_up_reward: float = 0.25
    center_reward: float = 0.4
    """Episode ends at rail limit with this one-shot penalty (no edge ramp)."""
    limit_penalty: float = 1000.0
    """Small per-step cost: rpm_penalty × |RPM| / max_rpm (higher command → fewer points)."""
    rpm_penalty: float = 0.02
    """Penalty per step when pole is within idle_angle_rad of hanging down."""
    idle_penalty: float = 1.0
    idle_angle_rad: float = math.radians(10.0)
    """Per full revolution of hub spin (integrated |Δθ| / 2π) per step."""
    spin_penalty_per_rev: float = 40.0
    obs_scale: tuple[float, float, float, float] = (0.5, math.pi, 2.0, 10.0)


def raw_observation(plant: CartPendulumPlant) -> np.ndarray:
    """Physical state for logging / denormalized metrics (not clipped)."""
    s = plant.state
    return np.array(
        [s.x_m, s.theta_rad, s.v_mps, s.omega_rps],
        dtype=np.float32,
    )


def observation_from_raw(
    raw: np.ndarray,
    config: EnvConfig | None = None,
) -> np.ndarray:
    """Policy input from physical [x_m, θ, v_mps, ω] (hardware or logged traces)."""
    cfg = config or EnvConfig()
    return _normalize_obs(np.asarray(raw, dtype=np.float32), cfg.obs_scale)


def observation_from_plant(
    plant: CartPendulumPlant,
    config: EnvConfig | None = None,
) -> np.ndarray:
    """Policy input: normalized MuJoCo-style qpos + qvel."""
    return observation_from_raw(raw_observation(plant), config)


def _normalize_obs(raw: np.ndarray, scale: tuple[float, ...]) -> np.ndarray:
    scaled = raw / np.asarray(scale, dtype=np.float32)
    return np.clip(scaled, -5.0, 5.0).astype(np.float32)


def rpm_from_policy_action(
    action: float,
    cfg: EnvConfig,
    *,
    action_space: str | None,
) -> float:
    """Map policy output to motor RPM (legacy checkpoints used raw RPM bounds)."""
    if action_space == "normalized":
        return float(np.clip(action, -1.0, 1.0)) * cfg.max_rpm
    return float(np.clip(action, -cfg.max_rpm, cfg.max_rpm))


def _pole_angle_error(theta_rad: float) -> float:
    """Shortest signed angle from current θ to upright (rad)."""
    return math.atan2(
        math.sin(theta_rad - UPRIGHT_THETA_RAD),
        math.cos(theta_rad - UPRIGHT_THETA_RAD),
    )


def _pole_angle_error_from_hanging(theta_rad: float) -> float:
    """Shortest signed angle from current θ to hanging down (rad)."""
    return math.atan2(
        math.sin(theta_rad - HANGING_THETA_RAD),
        math.cos(theta_rad - HANGING_THETA_RAD),
    )


def _theta_delta_rad(prev_theta_rad: float, theta_rad: float) -> float:
    """Shortest signed change in hinge angle (rad)."""
    return math.atan2(
        math.sin(theta_rad - prev_theta_rad),
        math.cos(theta_rad - prev_theta_rad),
    )


def is_plant_healthy(plant: CartPendulumPlant, config: EnvConfig | None = None) -> bool:
    """
    Upright + on-rail check for UI / inference metrics.

    Training does not terminate on fall—only on rail edge—so the agent can learn swing-up.
    """
    cfg = config or EnvConfig()
    s = plant.state
    if not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all():
        return False
    if abs(s.x_m) > cfg.x_limit_m:
        return False
    return abs(_pole_angle_error(s.theta_rad)) < cfg.healthy_angle_rad


class CartPendulumRpmEnv(gym.Env):
    """
    One RL step = one policy decision at ``cfg.dt_sec``; plant integrates MuJoCo
    internally at 240 Hz.

    Action: normalized motor command ∈ [-1, 1] (scaled to RPM in ``step``).
    Observation: normalized [x, θ, vx, ω].
    """

    metadata = {
        "render_modes": ["human"],
        "render_fps": 30,
        "observation_structure": {"qpos": ["x_m", "theta_rad"], "qvel": ["v_mps", "omega_rps"]},
    }

    def __init__(
        self,
        config: EnvConfig | None = None,
        render_mode: str | None = None,
    ) -> None:
        super().__init__()
        self.cfg = config or EnvConfig()
        self.render_mode = render_mode
        self.plant = CartPendulumPlant(config=self._plant_config())
        self.action_space = spaces.Box(
            low=np.array([-1.0], dtype=np.float32),
            high=np.array([1.0], dtype=np.float32),
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(
            low=-5.0,
            high=5.0,
            shape=(4,),
            dtype=np.float32,
        )
        self._step_count = 0
        self._prev_theta_rad: float | None = None
        self._spin_rev_accum = 0.0
        self._viewer: Any = None

    def _plant_config(self) -> PlantConfig:
        c = self.cfg
        return PlantConfig(
            gravity=c.gravity,
            pendulum_length_m=c.pendulum_length_m,
            cart_velocity_tracking_per_sec=c.cart_velocity_tracking_per_sec,
            angular_damping_per_sec=c.angular_damping_per_sec,
            max_internal_step_sec=1.0 / 240.0,
        )

    def _obs(self) -> np.ndarray:
        return observation_from_plant(self.plant, self.cfg)

    def _is_healthy(self) -> bool:
        return is_plant_healthy(self.plant, self.cfg)

    def _rpm_penalty(self, rpm: float) -> float:
        if self.cfg.rpm_penalty <= 0.0:
            return 0.0
        return self.cfg.rpm_penalty * abs(rpm) / max(self.cfg.max_rpm, 1e-6)

    def _step_reward(self, rpm: float) -> tuple[float, bool]:
        """
        + swing_up (always), upright (in balance cone), center (only when upright)
        − rpm_penalty, idle_penalty (within ±idle_angle of hanging down)
        − spin_penalty_per_rev × |Δθ| / 2π (discourages continuous looping)
        At |x| ≥ x_limit: −limit_penalty and terminate episode.
        """
        cfg = self.cfg
        s = self.plant.state
        if not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all():
            return -cfg.limit_penalty, True, 0.0

        x_abs = abs(s.x_m)
        if x_abs >= cfg.x_limit_m:
            return -cfg.limit_penalty, True, 0.0

        angle_err = abs(_pole_angle_error(s.theta_rad))
        upright = angle_err < cfg.healthy_angle_rad
        reward = 0.0

        if cfg.swing_up_reward > 0.0:
            reward += cfg.swing_up_reward * max(0.0, (math.pi - angle_err) / math.pi)

        if upright:
            reward += cfg.upright_reward
            if cfg.center_reward > 0.0 and cfg.x_limit_m > 0.0:
                reward += cfg.center_reward * (1.0 - x_abs / cfg.x_limit_m)

        hang_err = abs(_pole_angle_error_from_hanging(s.theta_rad))
        if cfg.idle_penalty > 0.0 and hang_err < cfg.idle_angle_rad:
            reward -= cfg.idle_penalty

        theta = s.theta_rad
        spin_penalty = 0.0
        if self._prev_theta_rad is not None and cfg.spin_penalty_per_rev > 0.0:
            d_theta = abs(_theta_delta_rad(self._prev_theta_rad, theta))
            revs = d_theta / (2.0 * math.pi)
            self._spin_rev_accum += revs
            spin_penalty = cfg.spin_penalty_per_rev * revs
            reward -= spin_penalty
        self._prev_theta_rad = theta

        reward -= self._rpm_penalty(rpm)
        return reward, False, spin_penalty

    def _reward_and_terminated(self, rpm: float) -> tuple[float, bool, bool, float]:
        reward, terminated, spin_penalty = self._step_reward(rpm)
        truncated = self._step_count >= self.cfg.max_episode_steps
        return reward, terminated, truncated, spin_penalty

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        opts = options or {}
        rng = self.np_random
        scale = self.cfg.reset_noise_scale

        x0 = float(rng.uniform(-scale, scale))
        v0 = float(rng.uniform(-scale, scale))
        omega0 = float(rng.uniform(-scale, scale))
        theta0 = float(HANGING_THETA_RAD + rng.uniform(-scale, scale))

        if "initial_theta_rad" in opts:
            theta0 = float(opts["initial_theta_rad"])
        if "initial_x_m" in opts:
            x0 = float(opts["initial_x_m"])

        self.plant.state = PlantState(
            x_m=x0,
            v_mps=v0,
            theta_rad=theta0,
            omega_rps=omega0,
            v_cmd_mps=0.0,
        )
        self.plant.sync_state_to_mujoco()
        self._step_count = 0
        self._prev_theta_rad = theta0
        self._spin_rev_accum = 0.0
        healthy = self._is_healthy()
        return self._obs(), {
            "raw_obs": raw_observation(self.plant),
            "is_healthy": healthy,
        }

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        cmd = float(np.clip(action[0], -1.0, 1.0))
        rpm = cmd * self.cfg.max_rpm
        self.plant.state.v_cmd_mps = -rpm * self.cfg.mps_per_rpm
        self.plant.step(self.cfg.dt_sec)
        self._step_count += 1
        obs = self._obs()
        reward, terminated, truncated, spin_penalty = self._reward_and_terminated(rpm)
        healthy = self._is_healthy()
        info: dict[str, Any] = {
            "raw_obs": raw_observation(self.plant),
            "rpm": rpm,
            "rpm_penalty": self._rpm_penalty(rpm),
            "spin_penalty": spin_penalty,
            "spin_rev_accum": self._spin_rev_accum,
            "x_m": self.plant.state.x_m,
            "theta_rad": self.plant.state.theta_rad,
            "is_healthy": healthy,
            "reward_survive": self.cfg.upright_reward if healthy else 0.0,
            "pole_angle_error_rad": _pole_angle_error(self.plant.state.theta_rad),
        }
        return obs, reward, terminated, truncated, info

    def render(self) -> None:
        if self.render_mode != "human":
            return
        if self._viewer is None:
            import mujoco.viewer

            self._viewer = mujoco.viewer.launch_passive(
                self.plant._model,
                self.plant._data,
            )
        self._viewer.sync()

    def close(self) -> None:
        if self._viewer is not None:
            self._viewer.close()
            self._viewer = None
