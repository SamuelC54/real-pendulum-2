"""
Reinforcement learning for the cart–pendulum (Gymnasium + Stable-Baselines3).

Package layout:
  env.py       — Gymnasium environment wrapping ``cart_pendulum.plant`` (MuJoCo)
  train.py     — CLI to train PPO and write numbered checkpoints
  service.py   — Background train/infer threads for the physics-sim HTTP API
  paths.py     — ``rl/gen/<n>/`` checkpoint paths and metadata
  render_ai.py — Offline MuJoCo viewer for a saved generation
"""

from .env import CartPendulumRpmEnv

__all__ = ["CartPendulumRpmEnv"]
