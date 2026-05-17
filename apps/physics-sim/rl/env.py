"""Gymnasium environment: RPM command → MuJoCo cart–pendulum.

Balance task follows Gymnasium ``InvertedPendulum-v5`` patterns (qpos/qvel obs, +1
survival reward, angle-based termination). See:
https://gymnasium.farama.org/environments/mujoco/inverted_pendulum/
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from cart_pendulum.plant import CartPendulumPlant, PlantConfig, PlantState

# Match web jog slider (`apps/web/src/lib/jogMath.ts`).
DEFAULT_MAX_RPM = 4000.0
DEFAULT_MPS_PER_RPM = 0.0007
# In this model θ=0 is hanging down; upright (classic cart-pole) is θ≈π.
UPRIGHT_THETA_RAD = math.pi
# InvertedPendulum-v5: pole is upright when |angle| < 0.2 rad (around target pose).
DEFAULT_HEALTHY_ANGLE_RAD = 0.2


@dataclass
class EnvConfig:
    """Task and plant settings for RL."""

    dt_sec: float = 1.0 / 30.0
    max_episode_steps: int = 1000
    max_rpm: float = DEFAULT_MAX_RPM
    mps_per_rpm: float = DEFAULT_MPS_PER_RPM
    gravity: float = 9.80665
    pendulum_length_m: float = 0.35
    cart_velocity_tracking_per_sec: float = 12.0
    angular_damping_per_sec: float = 0.04
    x_limit_m: float = 0.45
    task: str = "balance"  # "balance" (upright) | "center" (hang down, stay centered)
    healthy_angle_rad: float = DEFAULT_HEALTHY_ANGLE_RAD
    reset_noise_scale: float = 0.01
    # Observation scales for roughly normalized Box in [-1, 1].
    obs_scale: tuple[float, float, float, float] = (0.5, math.pi, 2.0, 10.0)


def raw_observation(plant: CartPendulumPlant) -> np.ndarray:
    """MuJoCo-style qpos + qvel: cart x, hinge θ, cart vx, hinge ω."""
    s = plant.state
    return np.array(
        [s.x_m, s.theta_rad, s.v_mps, s.omega_rps],
        dtype=np.float32,
    )


def observation_from_plant(
    plant: CartPendulumPlant,
    config: EnvConfig | None = None,
) -> np.ndarray:
    cfg = config or EnvConfig()
    return _normalize_obs(raw_observation(plant), cfg.obs_scale)


def _normalize_obs(raw: np.ndarray, scale: tuple[float, ...]) -> np.ndarray:
    scaled = raw / np.asarray(scale, dtype=np.float32)
    return np.clip(scaled, -5.0, 5.0).astype(np.float32)


def _target_theta_rad(task: str) -> float:
    return UPRIGHT_THETA_RAD if task == "balance" else 0.0


def _pole_angle_error(theta_rad: float, task: str) -> float:
    """Signed shortest angle to the task target pose (rad)."""
    target = _target_theta_rad(task)
    return math.atan2(math.sin(theta_rad - target), math.cos(theta_rad - target))


def is_plant_healthy(plant: CartPendulumPlant, config: EnvConfig | None = None) -> bool:
    """Shared health check for env steps and live inference metrics."""
    cfg = config or EnvConfig()
    s = plant.state
    if not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all():
        return False
    if abs(s.x_m) > cfg.x_limit_m:
        return False
    angle_err = abs(_pole_angle_error(s.theta_rad, cfg.task))
    if cfg.task == "balance":
        return angle_err < cfg.healthy_angle_rad
    return angle_err < cfg.healthy_angle_rad and abs(s.x_m) < 0.15


class CartPendulumRpmEnv(gym.Env):
    """
    Observation (4, qpos+qvel): cart x, θ, cart vx, ω.
    Action (1): commanded motor RPM in [-max_rpm, max_rpm] (Teknic sign: +rpm → v_cmd < 0).

  Balance reward: +1 per step while healthy (|θ − π| < healthy_angle_rad), like InvertedPendulum-v5.
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
            low=np.array([-self.cfg.max_rpm], dtype=np.float32),
            high=np.array([self.cfg.max_rpm], dtype=np.float32),
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(
            low=-5.0,
            high=5.0,
            shape=(4,),
            dtype=np.float32,
        )
        self._step_count = 0
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

    def _reward_and_terminated(self) -> tuple[float, bool, bool]:
        cfg = self.cfg
        healthy = self._is_healthy()

        if cfg.task == "balance":
            # InvertedPendulum-v5: +1 while upright, episode ends when unhealthy.
            reward = 1.0 if healthy else 0.0
            terminated = not healthy
        else:
            s = self.plant.state
            reward = float(-abs(s.x_m) - 0.1 * abs(_pole_angle_error(s.theta_rad, cfg.task)))
            terminated = not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all() or abs(
                s.x_m
            ) > cfg.x_limit_m

        truncated = self._step_count >= cfg.max_episode_steps
        return reward, terminated, truncated

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        opts = options or {}
        rng = self.np_random
        cfg = self.cfg
        scale = cfg.reset_noise_scale
        target_theta = _target_theta_rad(cfg.task)

        x0 = float(rng.uniform(-scale, scale))
        theta0 = float(target_theta + rng.uniform(-scale, scale))
        v0 = float(rng.uniform(-scale, scale))
        omega0 = float(rng.uniform(-scale, scale))

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
        healthy = self._is_healthy()
        return self._obs(), {
            "raw_obs": raw_observation(self.plant),
            "is_healthy": healthy,
        }

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        rpm = float(np.clip(action[0], -self.cfg.max_rpm, self.cfg.max_rpm))
        self.plant.state.v_cmd_mps = -rpm * self.cfg.mps_per_rpm
        self.plant.step(self.cfg.dt_sec)
        self._step_count += 1
        obs = self._obs()
        reward, terminated, truncated = self._reward_and_terminated()
        healthy = self._is_healthy()
        info: dict[str, Any] = {
            "raw_obs": raw_observation(self.plant),
            "rpm": rpm,
            "x_m": self.plant.state.x_m,
            "theta_rad": self.plant.state.theta_rad,
            "is_healthy": healthy,
            "reward_survive": reward if self.cfg.task == "balance" else None,
            "pole_angle_error_rad": _pole_angle_error(self.plant.state.theta_rad, self.cfg.task),
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
