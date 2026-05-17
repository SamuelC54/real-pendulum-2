"""
Reinforcement learning for the cart–pendulum (Gymnasium + Stable-Baselines3).

Package layout:
  env.py       — Gymnasium environment wrapping ``cart_pendulum.plant`` (MuJoCo)
  train.py     — CLI to train PPO and write numbered checkpoints
  service.py   — Background train/infer threads for the physics-sim HTTP API
  paths.py     — ``rl/gen/<n>/`` checkpoint paths and metadata
  render_ai.py — Offline MuJoCo viewer for a saved generation
"""

from .env import (
    CartPendulumRpmEnv,
    CurriculumConfig,
    DomainRandomizationConfig,
    EnvConfig,
    RewardBreakdown,
    RewardConfig,
    is_balanced,
    is_balanced_from_logged_state,
    is_state_valid,
    policy_observation_from_logged_state,
    policy_observation_from_plant,
    raw_state_from_plant,
    parse_normalized_action,
    rpm_from_normalized_action,
)

__all__ = [
    "CartPendulumRpmEnv",
    "CurriculumConfig",
    "DomainRandomizationConfig",
    "EnvConfig",
    "RewardBreakdown",
    "RewardConfig",
    "is_balanced",
    "is_balanced_from_logged_state",
    "is_state_valid",
    "policy_observation_from_logged_state",
    "policy_observation_from_plant",
    "raw_state_from_plant",
    "parse_normalized_action",
    "rpm_from_normalized_action",
]
