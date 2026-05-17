"""
Gymnasium environment: normalized motor command → ``CartPendulumPlant`` (MuJoCo).

Contracts:
  - **Action**: one float in [-1, 1] → RPM via ``rpm_from_normalized_action``.
  - **Observation**: normalized [x, sin θ, cos θ, v, ω] (θ is not in the policy vector).
  - **Logged state**: [x, θ, v, ω] for hardware API / twin telemetry only.
  - **Reward**: computed once in ``_compute_reward`` → ``RewardBreakdown``.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from cart_pendulum.plant import CartPendulumPlant, PlantConfig, PlantState

DEFAULT_MAX_RPM = 1500.0
DEFAULT_MPS_PER_RPM = 0.0007
HANGING_THETA_RAD = 0.0
UPRIGHT_THETA_RAD = math.pi
DEFAULT_HEALTHY_ANGLE_RAD = 0.2
LOGGED_STATE_DIM = 4
POLICY_OBS_DIM = 5

CurriculumPhase = Literal["balance", "recovery", "swing_up", "hanging"]


@dataclass
class CurriculumConfig:
    """Initial-state distribution for training resets."""

    enabled: bool = False
    phase: str = "swing_up"
    balance_theta_rad: float = 0.1
    recovery_theta_rad: float = 0.5
    hanging_theta_rad: float = 0.05
    balance_weight: float = 0.0
    recovery_weight: float = 0.0
    swing_up_weight: float = 1.0
    hanging_weight: float = 0.0

    def __post_init__(self) -> None:
        if self.balance_theta_rad < 0.0 or self.recovery_theta_rad < 0.0:
            raise ValueError("curriculum theta spreads must be >= 0")


@dataclass
class DomainRandomizationConfig:
    """Per-episode plant / motor scale factors (does not mutate ``EnvConfig``)."""

    enabled: bool = False
    pendulum_length_scale: tuple[float, float] = (0.95, 1.05)
    gravity_scale: tuple[float, float] = (0.98, 1.02)
    angular_damping_scale: tuple[float, float] = (0.8, 1.2)
    cart_tracking_scale: tuple[float, float] = (0.9, 1.1)
    mps_per_rpm_scale: tuple[float, float] = (0.9, 1.1)


@dataclass
class RewardConfig:
    """Per-step reward shaping (see ``CartPendulumRpmEnv._compute_reward``)."""

    upright_reward: float = 5.0
    center_reward: float = 2.0
    angle_progress_reward: float = 1.5
    rail_position_penalty: float = 0.2
    rail_velocity_penalty: float = 0.15
    energy_error_penalty: float = 0.08
    balance_velocity_penalty: float = 0.05
    balance_omega_penalty: float = 0.05
    limit_penalty: float = 1000.0
    rpm_penalty: float = 0.02
    rpm_delta_penalty: float = 0.01
    success_upright_sec: float = 3.0
    success_bonus: float = 50.0
    success_terminates: bool = True

    def __post_init__(self) -> None:
        if self.success_upright_sec < 0.0:
            raise ValueError("success_upright_sec must be >= 0")


@dataclass
class EnvConfig:
    """Hyperparameters shared by training, inference, and tests."""

    dt_sec: float = 1.0 / 30.0
    max_episode_steps: int = 1000
    max_rpm: float = DEFAULT_MAX_RPM
    mps_per_rpm: float = DEFAULT_MPS_PER_RPM
    gravity: float = 9.80665
    pendulum_length_m: float = 0.15
    cart_velocity_tracking_per_sec: float = 12.0
    angular_damping_per_sec: float = 0.04
    x_limit_m: float = 0.2
    healthy_angle_rad: float = DEFAULT_HEALTHY_ANGLE_RAD
    reset_noise_scale: float = 0.01
    x_obs_scale: float = 0.5
    v_obs_scale: float = 2.0
    omega_obs_scale: float = 10.0
    rewards: RewardConfig = field(default_factory=RewardConfig)
    curriculum: CurriculumConfig = field(default_factory=CurriculumConfig)
    domain_randomization: DomainRandomizationConfig = field(
        default_factory=DomainRandomizationConfig,
    )

    def __post_init__(self) -> None:
        if self.dt_sec <= 0.0:
            raise ValueError("dt_sec must be > 0")
        if self.max_episode_steps <= 0:
            raise ValueError("max_episode_steps must be > 0")
        if self.max_rpm <= 0.0:
            raise ValueError("max_rpm must be > 0")
        if self.mps_per_rpm <= 0.0:
            raise ValueError("mps_per_rpm must be > 0")
        if self.x_limit_m <= 0.0:
            raise ValueError("x_limit_m must be > 0")
        if self.pendulum_length_m <= 0.0:
            raise ValueError("pendulum_length_m must be > 0")
        if self.x_obs_scale <= 0.0 or self.v_obs_scale <= 0.0 or self.omega_obs_scale <= 0.0:
            raise ValueError("observation scales must be > 0")


@dataclass
class RewardBreakdown:
    """Single-step reward and components (for Gym return + logging)."""

    total: float
    terminated: bool
    upright_factor: float = 0.0
    upright_reward: float = 0.0
    center_reward: float = 0.0
    angle_progress_reward: float = 0.0
    rail_position_penalty: float = 0.0
    rail_velocity_penalty: float = 0.0
    energy_penalty: float = 0.0
    balance_velocity_penalty: float = 0.0
    balance_omega_penalty: float = 0.0
    rpm_penalty: float = 0.0
    rpm_delta_penalty: float = 0.0
    success_reward: float = 0.0
    angle_err_rad: float = 0.0
    upright: bool = False
    upright_steps: int = 0
    pendulum_energy_j: float = 0.0

    def to_info(self) -> dict[str, Any]:
        """Flat dict for Gym ``info`` (reward component keys match field names)."""
        return asdict(self)


# --- Logged physical state (hardware / twin) ---------------------------------

def raw_state_from_plant(plant: CartPendulumPlant) -> np.ndarray:
    """Physical state ``[x_m, θ, v_mps, ω]`` for logging and hardware API."""
    s = plant.state
    return np.array([s.x_m, s.theta_rad, s.v_mps, s.omega_rps], dtype=np.float32)


# Backward-compatible alias
raw_observation = raw_state_from_plant


# --- Policy observation -------------------------------------------------------

def policy_features_from_state(state: PlantState) -> np.ndarray:
    """Unnormalized policy features ``[x, sin θ, cos θ, v, ω]``."""
    return np.array(
        [
            state.x_m,
            math.sin(state.theta_rad),
            math.cos(state.theta_rad),
            state.v_mps,
            state.omega_rps,
        ],
        dtype=np.float32,
    )


def _normalize_policy_features(features: np.ndarray, cfg: EnvConfig) -> np.ndarray:
    x, sin_t, cos_t, v, omega = features
    scaled = np.array(
        [
            x / cfg.x_obs_scale,
            sin_t,
            cos_t,
            v / cfg.v_obs_scale,
            omega / cfg.omega_obs_scale,
        ],
        dtype=np.float32,
    )
    return np.clip(scaled, -5.0, 5.0).astype(np.float32)


def policy_observation_from_state(
    state: PlantState,
    config: EnvConfig | None = None,
) -> np.ndarray:
    """Normalized policy observation."""
    cfg = config or EnvConfig()
    return _normalize_policy_features(policy_features_from_state(state), cfg)


def policy_observation_from_plant(
    plant: CartPendulumPlant,
    config: EnvConfig | None = None,
) -> np.ndarray:
    return policy_observation_from_state(plant.state, config)


def policy_observation_from_logged_state(
    logged_state: np.ndarray,
    config: EnvConfig | None = None,
) -> np.ndarray:
    """Build policy observation from hardware/twin ``[x, θ, v, ω]``."""
    raw = np.asarray(logged_state, dtype=np.float32).reshape(-1)
    if raw.shape != (LOGGED_STATE_DIM,):
        raise ValueError(
            f"Expected logged state shape ({LOGGED_STATE_DIM},), got {raw.shape}",
        )
    state = PlantState(
        x_m=float(raw[0]),
        theta_rad=float(raw[1]),
        v_mps=float(raw[2]),
        omega_rps=float(raw[3]),
    )
    return policy_observation_from_state(state, config)


# --- Actions ------------------------------------------------------------------

def parse_normalized_action(action: Any) -> float:
    """Single normalized motor command in [-1, 1] from Gymnasium / SB3 action."""
    action_arr = np.asarray(action, dtype=np.float32).reshape(-1)
    if action_arr.size != 1:
        raise ValueError(
            f"Expected a single action value, got shape {np.asarray(action).shape}",
        )
    return float(np.clip(action_arr[0], -1.0, 1.0))


def rpm_from_normalized_action(action: float, cfg: EnvConfig) -> float:
    return float(np.clip(action, -1.0, 1.0)) * cfg.max_rpm


# --- Geometry / energy --------------------------------------------------------

def pole_angle_error_rad(theta_rad: float) -> float:
    """Shortest signed angle from current θ to upright (rad)."""
    return math.atan2(
        math.sin(theta_rad - UPRIGHT_THETA_RAD),
        math.cos(theta_rad - UPRIGHT_THETA_RAD),
    )


def _theta_delta_rad(prev_theta_rad: float, theta_rad: float) -> float:
    return math.atan2(
        math.sin(theta_rad - prev_theta_rad),
        math.cos(theta_rad - prev_theta_rad),
    )


def pendulum_energy_j(
    theta_rad: float,
    omega_rps: float,
    *,
    gravity: float,
    length_m: float,
) -> float:
    pe = gravity * length_m * (1.0 - math.cos(theta_rad))
    ke = 0.5 * (length_m * omega_rps) ** 2
    return ke + pe


def upright_target_energy_j(gravity: float, length_m: float) -> float:
    return pendulum_energy_j(UPRIGHT_THETA_RAD, 0.0, gravity=gravity, length_m=length_m)


# --- Validity / balance -------------------------------------------------------

def is_state_valid(plant: CartPendulumPlant, config: EnvConfig | None = None) -> bool:
    """Finite state and cart still on the rail (not past the limit)."""
    cfg = config or EnvConfig()
    s = plant.state
    if not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all():
        return False
    return abs(s.x_m) < cfg.x_limit_m


def is_balanced(plant: CartPendulumPlant, config: EnvConfig | None = None) -> bool:
    """Upright balance cone and on the rail."""
    if not is_state_valid(plant, config):
        return False
    cfg = config or EnvConfig()
    return abs(pole_angle_error_rad(plant.state.theta_rad)) < cfg.healthy_angle_rad


def is_balanced_from_logged_state(logged_state: np.ndarray, config: EnvConfig | None = None) -> bool:
    raw = np.asarray(logged_state, dtype=np.float32).reshape(-1)
    if raw.shape != (LOGGED_STATE_DIM,) or not np.isfinite(raw).all():
        return False
    cfg = config or EnvConfig()
    if abs(float(raw[0])) >= cfg.x_limit_m:
        return False
    return abs(pole_angle_error_rad(float(raw[1]))) < cfg.healthy_angle_rad


# Deprecated names
is_plant_balanced = is_balanced
is_plant_healthy = is_balanced
_pole_angle_error = pole_angle_error_rad
_pendulum_energy_j = pendulum_energy_j
_upright_target_energy_j = upright_target_energy_j


def _plant_configs_equal(a: PlantConfig, b: PlantConfig) -> bool:
    return (
        a.gravity == b.gravity
        and a.pendulum_length_m == b.pendulum_length_m
        and a.cart_velocity_tracking_per_sec == b.cart_velocity_tracking_per_sec
        and a.angular_damping_per_sec == b.angular_damping_per_sec
        and a.max_internal_step_sec == b.max_internal_step_sec
    )


class CartPendulumRpmEnv(gym.Env):
    """
    One RL step = one policy decision at ``cfg.dt_sec``; plant integrates MuJoCo
    internally at 240 Hz.
    """

    metadata = {
        "render_modes": ["human"],
        "render_fps": 30,
        "observation_structure": {
            "policy": ["x_m", "sin_theta", "cos_theta", "v_mps", "omega_rps"],
            "logged": ["x_m", "theta_rad", "v_mps", "omega_rps"],
        },
    }

    def __init__(
        self,
        config: EnvConfig | None = None,
        render_mode: str | None = None,
    ) -> None:
        super().__init__()
        self.cfg = config or EnvConfig()
        self.render_mode = render_mode
        self.plant = CartPendulumPlant(config=self._nominal_plant_config())
        self.action_space = spaces.Box(
            low=np.array([-1.0], dtype=np.float32),
            high=np.array([1.0], dtype=np.float32),
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(
            low=-5.0,
            high=5.0,
            shape=(POLICY_OBS_DIM,),
            dtype=np.float32,
        )
        self._step_count = 0
        self._prev_theta_rad: float | None = None
        self._prev_rpm = 0.0
        self._spin_rev_accum = 0.0
        self._upright_steps = 0
        self._curriculum_phase: CurriculumPhase = "swing_up"
        self._episode_mps_per_rpm = self.cfg.mps_per_rpm
        self._episode_length_m = self.cfg.pendulum_length_m
        self._episode_gravity = self.cfg.gravity
        self._viewer: Any = None
        if self.cfg.curriculum.enabled:
            self._apply_curriculum_phase(self.cfg.curriculum.phase)

    def set_curriculum_phase(self, phase: str) -> None:
        self._apply_curriculum_phase(phase)

    def _apply_curriculum_phase(self, phase: str) -> None:
        normalized = phase.lower().replace("-", "_")
        if normalized in ("swing_up", "swingup", "full"):
            self._curriculum_phase = "swing_up"
        elif normalized in ("balance", "balanced"):
            self._curriculum_phase = "balance"
        elif normalized in ("recovery", "recover"):
            self._curriculum_phase = "recovery"
        elif normalized in ("hanging", "hang"):
            self._curriculum_phase = "hanging"
        elif normalized == "mixed":
            pass
        else:
            raise ValueError(f"Unknown curriculum phase: {phase}")

    def _sample_curriculum_phase(self) -> CurriculumPhase:
        cur = self.cfg.curriculum
        if cur.phase != "mixed":
            self._apply_curriculum_phase(cur.phase)
            return self._curriculum_phase
        weights = np.array(
            [
                cur.balance_weight,
                cur.recovery_weight,
                cur.swing_up_weight,
                cur.hanging_weight,
            ],
            dtype=np.float64,
        )
        total = weights.sum()
        if total <= 0.0:
            return "swing_up"
        idx = int(self.np_random.choice(4, p=weights / total))
        phases: tuple[CurriculumPhase, ...] = (
            "balance",
            "recovery",
            "swing_up",
            "hanging",
        )
        self._curriculum_phase = phases[idx]
        return self._curriculum_phase

    def _curriculum_initial_theta(self, rng: np.random.Generator) -> float:
        cur = self.cfg.curriculum
        phase = self._curriculum_phase
        if phase == "balance":
            return float(
                UPRIGHT_THETA_RAD + rng.uniform(-cur.balance_theta_rad, cur.balance_theta_rad),
            )
        if phase == "recovery":
            return float(
                UPRIGHT_THETA_RAD + rng.uniform(-cur.recovery_theta_rad, cur.recovery_theta_rad),
            )
        return float(
            HANGING_THETA_RAD + rng.uniform(-cur.hanging_theta_rad, cur.hanging_theta_rad),
        )

    def _apply_domain_randomization(self, rng: np.random.Generator) -> None:
        dr = self.cfg.domain_randomization
        if not dr.enabled:
            self._episode_mps_per_rpm = self.cfg.mps_per_rpm
            self._episode_length_m = self.cfg.pendulum_length_m
            self._episode_gravity = self.cfg.gravity
            plant_cfg = self._nominal_plant_config()
        else:
            self._episode_length_m = self.cfg.pendulum_length_m * float(
                rng.uniform(*dr.pendulum_length_scale),
            )
            self._episode_gravity = self.cfg.gravity * float(rng.uniform(*dr.gravity_scale))
            self._episode_mps_per_rpm = self.cfg.mps_per_rpm * float(
                rng.uniform(*dr.mps_per_rpm_scale),
            )
            plant_cfg = PlantConfig(
                gravity=self._episode_gravity,
                pendulum_length_m=self._episode_length_m,
                cart_velocity_tracking_per_sec=self.cfg.cart_velocity_tracking_per_sec
                * float(rng.uniform(*dr.cart_tracking_scale)),
                angular_damping_per_sec=self.cfg.angular_damping_per_sec
                * float(rng.uniform(*dr.angular_damping_scale)),
                max_internal_step_sec=1.0 / 240.0,
            )
        if not _plant_configs_equal(plant_cfg, self.plant.config):
            self.plant = CartPendulumPlant(config=plant_cfg, state=self.plant.state)

    def _nominal_plant_config(self) -> PlantConfig:
        c = self.cfg
        return PlantConfig(
            gravity=c.gravity,
            pendulum_length_m=c.pendulum_length_m,
            cart_velocity_tracking_per_sec=c.cart_velocity_tracking_per_sec,
            angular_damping_per_sec=c.angular_damping_per_sec,
            max_internal_step_sec=1.0 / 240.0,
        )

    def _obs(self) -> np.ndarray:
        return policy_observation_from_plant(self.plant, self.cfg)

    def _rpm_penalty(self, rpm: float) -> float:
        r = self.cfg.rewards
        if r.rpm_penalty <= 0.0:
            return 0.0
        return r.rpm_penalty * abs(rpm) / max(self.cfg.max_rpm, 1e-6)

    def _rpm_delta_penalty(self, rpm: float) -> float:
        r = self.cfg.rewards
        if r.rpm_delta_penalty <= 0.0:
            return 0.0
        delta = abs(rpm - self._prev_rpm) / max(self.cfg.max_rpm, 1e-6)
        return r.rpm_delta_penalty * delta

    def _compute_reward(self, rpm: float) -> RewardBreakdown:
        cfg = self.cfg
        rwd = cfg.rewards
        s = self.plant.state

        if not np.isfinite([s.x_m, s.theta_rad, s.v_mps, s.omega_rps]).all():
            return RewardBreakdown(total=-rwd.limit_penalty, terminated=True)

        theta = s.theta_rad
        prev_angle_err: float | None = None
        if self._prev_theta_rad is not None:
            prev_angle_err = abs(pole_angle_error_rad(self._prev_theta_rad))
            d_theta = abs(_theta_delta_rad(self._prev_theta_rad, theta))
            self._spin_rev_accum += d_theta / (2.0 * math.pi)

        self._prev_theta_rad = theta
        angle_err = abs(pole_angle_error_rad(theta))

        if abs(s.x_m) >= cfg.x_limit_m:
            return RewardBreakdown(
                total=-rwd.limit_penalty,
                terminated=True,
                angle_err_rad=angle_err,
            )

        upright = angle_err < cfg.healthy_angle_rad
        upright_factor = max(0.0, (math.pi - angle_err) / math.pi)
        rail_factor = abs(s.x_m) / cfg.x_limit_m if cfg.x_limit_m > 0.0 else 0.0

        upright_r = rwd.upright_reward * upright_factor if rwd.upright_reward > 0.0 else 0.0
        center_r = 0.0
        if upright and rwd.center_reward > 0.0:
            center_r = rwd.center_reward * (1.0 - rail_factor)

        progress_r = 0.0
        if prev_angle_err is not None and rwd.angle_progress_reward > 0.0:
            progress_r = rwd.angle_progress_reward * (prev_angle_err - angle_err)

        rail_pos_pen = (
            rwd.rail_position_penalty * (rail_factor**2) if rwd.rail_position_penalty > 0.0 else 0.0
        )
        rpm_pen = self._rpm_penalty(rpm)
        rpm_delta_pen = self._rpm_delta_penalty(rpm)

        energy_j = pendulum_energy_j(
            theta,
            s.omega_rps,
            gravity=self._episode_gravity,
            length_m=self._episode_length_m,
        )
        energy_pen = 0.0
        if not upright and rwd.energy_error_penalty > 0.0:
            target_e = upright_target_energy_j(self._episode_gravity, self._episode_length_m)
            energy_pen = rwd.energy_error_penalty * abs(target_e - energy_j)

        balance_v_pen = 0.0
        balance_o_pen = 0.0
        if upright:
            if rwd.balance_velocity_penalty > 0.0:
                balance_v_pen = rwd.balance_velocity_penalty * abs(s.v_mps)
            if rwd.balance_omega_penalty > 0.0:
                balance_o_pen = rwd.balance_omega_penalty * abs(s.omega_rps)

        rail_vel_pen = 0.0
        if rwd.rail_velocity_penalty > 0.0 and rail_factor > 0.0:
            toward_limit = (s.x_m > 0.0 and s.v_mps > 0.0) or (s.x_m < 0.0 and s.v_mps < 0.0)
            if toward_limit:
                rail_vel_pen = rwd.rail_velocity_penalty * abs(s.v_mps) * rail_factor

        if upright:
            self._upright_steps += 1
        else:
            self._upright_steps = 0

        success_r = 0.0
        terminated = False
        need_steps = int(rwd.success_upright_sec / cfg.dt_sec) if rwd.success_upright_sec > 0.0 else 0
        if need_steps > 0 and rwd.success_bonus > 0.0 and self._upright_steps >= need_steps:
            success_r = rwd.success_bonus
            terminated = rwd.success_terminates

        total = (
            upright_r
            + center_r
            + progress_r
            + success_r
            - rail_pos_pen
            - rail_vel_pen
            - energy_pen
            - balance_v_pen
            - balance_o_pen
            - rpm_pen
            - rpm_delta_pen
        )

        return RewardBreakdown(
            total=total,
            terminated=terminated,
            upright_factor=upright_factor,
            upright_reward=upright_r,
            center_reward=center_r,
            angle_progress_reward=progress_r,
            rail_position_penalty=rail_pos_pen,
            rail_velocity_penalty=rail_vel_pen,
            energy_penalty=energy_pen,
            balance_velocity_penalty=balance_v_pen,
            balance_omega_penalty=balance_o_pen,
            rpm_penalty=rpm_pen,
            rpm_delta_penalty=rpm_delta_pen,
            success_reward=success_r,
            angle_err_rad=angle_err,
            upright=upright,
            upright_steps=self._upright_steps,
            pendulum_energy_j=energy_j,
        )

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

        if self.cfg.curriculum.enabled and "initial_theta_rad" not in opts:
            if self.cfg.curriculum.phase == "mixed":
                self._sample_curriculum_phase()
            else:
                self._apply_curriculum_phase(self.cfg.curriculum.phase)
            theta0 = self._curriculum_initial_theta(rng)

        if "initial_theta_rad" in opts:
            theta0 = float(opts["initial_theta_rad"])
        if "initial_x_m" in opts:
            x0 = float(opts["initial_x_m"])
        if "initial_v_mps" in opts:
            v0 = float(opts["initial_v_mps"])
        if "initial_omega_rps" in opts:
            omega0 = float(opts["initial_omega_rps"])

        self._apply_domain_randomization(rng)
        self._upright_steps = 0

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
        self._prev_rpm = 0.0
        self._spin_rev_accum = 0.0

        return self._obs(), self._build_info()

    def _build_info(self, breakdown: RewardBreakdown | None = None) -> dict[str, Any]:
        info: dict[str, Any] = {
            "raw_state": raw_state_from_plant(self.plant),
            "theta_rad": self.plant.state.theta_rad,
            "x_m": self.plant.state.x_m,
            "is_state_valid": is_state_valid(self.plant, self.cfg),
            "is_balanced": is_balanced(self.plant, self.cfg),
            "spin_rev_accum": self._spin_rev_accum,
            "curriculum_phase": self._curriculum_phase,
            "episode_pendulum_length_m": self._episode_length_m,
            "episode_mps_per_rpm": self._episode_mps_per_rpm,
            "pole_angle_error_rad": pole_angle_error_rad(self.plant.state.theta_rad),
        }
        if breakdown is not None:
            info.update(breakdown.to_info())
        return info

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        cmd = parse_normalized_action(action)
        rpm = rpm_from_normalized_action(cmd, self.cfg)
        self.plant.state.v_cmd_mps = -rpm * self._episode_mps_per_rpm
        self.plant.step(self.cfg.dt_sec)
        self._step_count += 1

        breakdown = self._compute_reward(rpm)
        self._prev_rpm = rpm
        truncated = self._step_count >= self.cfg.max_episode_steps

        info = self._build_info(breakdown)
        info["rpm"] = rpm

        return (
            self._obs(),
            breakdown.total,
            breakdown.terminated,
            truncated,
            info,
        )

    def render(self) -> None:
        if self.render_mode != "human":
            return
        if self._viewer is None:
            import mujoco.viewer

            model, data = self.plant.mujoco_handles
            self._viewer = mujoco.viewer.launch_passive(model, data)
        self._viewer.sync()

    def close(self) -> None:
        if self._viewer is not None:
            self._viewer.close()
            self._viewer = None
