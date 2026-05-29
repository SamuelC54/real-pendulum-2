"""
Background PPO training and live-plant inference for the physics-sim HTTP API.

Training spins up its own vectorized Gym envs (separate from the live twin plant).
Sim inference steps the shared ``CartPendulumPlant`` at 30 Hz. Hardware inference only
loads the policy here; control-api polls sensors and calls :meth:`RlService.predict`.
"""

from __future__ import annotations

import threading
import traceback
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecNormalize

from cart_pendulum.plant import CartPendulumPlant

from .env import (
    CartPendulumRpmEnv,
    EnvConfig,
    is_plant_healthy,
    observation_from_plant,
    observation_from_raw,
    rpm_from_policy_action,
)
from .paths import (
    generation_dir,
    generation_model_path,
    latest_generation,
    list_generations,
    load_meta,
)
from .train import GenerationCallback

_MAX_METRICS = 400
InferenceTarget = Literal["sim", "hardware"]


@dataclass
class MetricPoint:
    timesteps: int
    meanReward: float
    generation: int | None = None


@dataclass
class TrainingStatus:
    active: bool = False
    timesteps: int = 0
    totalTimesteps: int = 0
    latestGeneration: int | None = None
    error: str | None = None


@dataclass
class InferenceStatus:
    active: bool = False
    target: InferenceTarget | None = None
    generation: int | None = None
    rpm: float = 0.0
    v_cmd_mps: float = 0.0
    lastReward: float = 0.0
    stepCount: int = 0
    error: str | None = None


@dataclass
class RlStatus:
    training: TrainingStatus = field(default_factory=TrainingStatus)
    inference: InferenceStatus = field(default_factory=InferenceStatus)
    metrics: list[MetricPoint] = field(default_factory=list)
    generations: list[int] = field(default_factory=list)


class _MetricsCallback(BaseCallback):
    """Push mean episode return to the RL page chart after each PPO rollout."""

    def __init__(self, service: "RlService", verbose: int = 0) -> None:
        super().__init__(verbose)
        self._service = service

    def _on_step(self) -> bool:
        return True

    def _on_rollout_end(self) -> None:
        if self.model is None:
            return
        ep_buffer = self.model.ep_info_buffer
        if len(ep_buffer) == 0:
            return
        mean_rew = float(np.mean([float(ep["r"]) for ep in ep_buffer]))
        gen = latest_generation()
        self._service._append_metric(self.num_timesteps, mean_rew, gen)


class _StopCallback(BaseCallback):
    """Cooperative cancel when the user hits stop in the UI."""

    def __init__(self, stop_event: threading.Event) -> None:
        super().__init__(0)
        self._stop = stop_event

    def _on_step(self) -> bool:
        return not self._stop.is_set()


class RlService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._plant: CartPendulumPlant | None = None
        self._plant_lock: threading.Lock | None = None
        self._metrics: deque[MetricPoint] = deque(maxlen=_MAX_METRICS)
        self._training = TrainingStatus()
        self._inference = InferenceStatus()
        self._train_stop = threading.Event()
        self._infer_stop = threading.Event()
        self._train_thread: threading.Thread | None = None
        self._infer_thread: threading.Thread | None = None
        self._infer_model: PPO | None = None
        self._infer_venv: VecNormalize | None = None
        self._infer_action_space: str | None = None
        self._infer_cfg = EnvConfig()

    def bind_plant(self, plant: CartPendulumPlant, plant_lock: threading.Lock) -> None:
        """Called once at server startup so sim inference can drive the live twin."""
        self._plant = plant
        self._plant_lock = plant_lock

    def _append_metric(self, timesteps: int, mean_reward: float, generation: int | None) -> None:
        with self._lock:
            self._metrics.append(
                MetricPoint(
                    timesteps=timesteps,
                    meanReward=mean_reward,
                    generation=generation,
                )
            )
            self._training.timesteps = timesteps
            if generation is not None:
                self._training.latestGeneration = generation

    def _release_policy(self) -> None:
        self._infer_model = None
        self._infer_venv = None
        self._infer_action_space = None

    def _load_policy(self, generation: int) -> None:
        path = generation_model_path(generation)
        if not path.is_file():
            raise FileNotFoundError(f"Missing checkpoint: {path}")

        vec_path = generation_dir(generation) / "vecnormalize.pkl"
        meta = load_meta(generation)
        self._infer_action_space = meta.get("action_space")
        self._infer_cfg = EnvConfig()

        model = PPO.load(str(path))
        infer_venv: VecNormalize | None = None
        if vec_path.is_file():
            venv = make_vec_env(lambda: CartPendulumRpmEnv(config=self._infer_cfg), n_envs=1)
            infer_venv = VecNormalize.load(str(vec_path), venv)
            infer_venv.training = False
            infer_venv.norm_reward = False
        elif meta.get("normalized"):
            raise FileNotFoundError(
                f"Generation {generation} was trained with VecNormalize but "
                f"{vec_path.name} is missing; retrain or pick another checkpoint."
            )

        self._infer_model = model
        self._infer_venv = infer_venv

    def predict(self, raw_observation: list[float] | np.ndarray) -> dict[str, float]:
        """Run loaded policy on physical [x_m, θ, v_mps, ω]; used for hardware inference."""
        with self._lock:
            if self._infer_model is None:
                raise RuntimeError("No policy loaded")
            model = self._infer_model
            infer_venv = self._infer_venv
            action_space = self._infer_action_space
            cfg = self._infer_cfg

        raw = np.asarray(raw_observation, dtype=np.float32).reshape(4)
        obs = observation_from_raw(raw, cfg).reshape(1, -1)
        if infer_venv is not None:
            obs = infer_venv.normalize_obs(obs)
        action, _ = model.predict(obs, deterministic=True)
        raw_action = float(np.asarray(action, dtype=np.float64).reshape(-1)[0])
        rpm = rpm_from_policy_action(raw_action, cfg, action_space=action_space)
        v_cmd = -rpm * cfg.mps_per_rpm
        reward = 1.0 if is_plant_healthy_from_raw(raw, cfg) else 0.0
        with self._lock:
            if self._inference.target == "hardware" and self._inference.active:
                self._inference.rpm = rpm
                self._inference.v_cmd_mps = v_cmd
                self._inference.lastReward = reward
                self._inference.stepCount += 1
        return {
            "rpm": rpm,
            "vCmdMps": v_cmd,
            "lastReward": reward,
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "training": {
                    "active": self._training.active,
                    "timesteps": self._training.timesteps,
                    "totalTimesteps": self._training.totalTimesteps,
                    "latestGeneration": self._training.latestGeneration,
                    "error": self._training.error,
                },
                "inference": {
                    "active": self._inference.active,
                    "target": self._inference.target,
                    "generation": self._inference.generation,
                    "rpm": self._inference.rpm,
                    "vCmdMps": self._inference.v_cmd_mps,
                    "lastReward": self._inference.lastReward,
                    "stepCount": self._inference.stepCount,
                    "error": self._inference.error,
                },
                "metrics": [
                    {
                        "timesteps": m.timesteps,
                        "meanReward": m.meanReward,
                        "generation": m.generation,
                    }
                    for m in self._metrics
                ],
                "generations": list_generations(),
            }

    def start_training(
        self,
        *,
        total_timesteps: int = 200_000,
        save_every: int = 10_000,
        n_envs: int = 4,
    ) -> dict[str, Any]:
        with self._lock:
            if self._training.active:
                raise RuntimeError("Training already running")
            if self._inference.active:
                raise RuntimeError("Stop AI inference before starting training")
            self._train_stop.clear()
            self._training = TrainingStatus(
                active=True,
                totalTimesteps=total_timesteps,
                latestGeneration=latest_generation(),
            )
            self._metrics.clear()

        def run() -> None:
            try:
                cfg = EnvConfig()
                vec = make_vec_env(lambda: CartPendulumRpmEnv(config=cfg), n_envs=n_envs)
                vec = VecNormalize(vec, norm_obs=True, norm_reward=True, clip_obs=5.0)
                model = PPO(
                    "MlpPolicy",
                    vec,
                    verbose=0,
                    n_steps=2048,
                    batch_size=256,
                    ent_coef=0.05,
                )
                start_gen = (latest_generation() or 0) + 1
                callbacks = [
                    _StopCallback(self._train_stop),
                    _MetricsCallback(self),
                    GenerationCallback(
                        save_every=save_every,
                        start_gen=start_gen,
                        verbose=0,
                    ),
                ]
                model.learn(total_timesteps=total_timesteps, callback=callbacks, progress_bar=False)
            except Exception as e:
                traceback.print_exc()
                with self._lock:
                    self._training.error = str(e)
            finally:
                with self._lock:
                    self._training.active = False
                    self._training.latestGeneration = latest_generation()

        self._train_thread = threading.Thread(target=run, name="rl-train", daemon=True)
        self._train_thread.start()
        return self.status()

    def stop_training(self) -> dict[str, Any]:
        self._train_stop.set()
        with self._lock:
            self._training.active = False
        return self.status()

    def load_policy(self, generation: int, *, target: InferenceTarget) -> dict[str, Any]:
        """Load checkpoint for hardware inference (control-api drives the plant)."""
        with self._lock:
            if self._training.active:
                raise RuntimeError("Stop training before starting AI")
            if self._inference.active:
                raise RuntimeError("Stop AI inference before loading another policy")
            self._load_policy(generation)
            self._inference = InferenceStatus(
                active=True,
                target=target,
                generation=generation,
            )
        return self.status()

    def start_inference(self, generation: int) -> dict[str, Any]:
        """Load policy and step the live MuJoCo plant at env dt (30 Hz)."""
        if self._plant is None or self._plant_lock is None:
            raise RuntimeError("Live plant not bound")

        with self._lock:
            if self._inference.active:
                raise RuntimeError("Inference already running")
            if self._training.active:
                raise RuntimeError("Stop training before starting AI")
            self._infer_stop.clear()
            self._load_policy(generation)
            self._inference = InferenceStatus(
                active=True,
                target="sim",
                generation=generation,
            )

        model = self._infer_model
        infer_venv = self._infer_venv
        action_space = self._infer_action_space
        cfg = self._infer_cfg
        assert model is not None

        def run() -> None:
            try:
                while not self._infer_stop.is_set():
                    with self._plant_lock:
                        plant = self._plant
                        assert plant is not None
                        obs = observation_from_plant(plant, cfg)
                        obs_in = obs.reshape(1, -1)
                        if infer_venv is not None:
                            obs_in = infer_venv.normalize_obs(obs_in)
                        action, _ = model.predict(obs_in, deterministic=True)
                        raw_action = float(np.asarray(action, dtype=np.float64).reshape(-1)[0])
                        rpm = rpm_from_policy_action(
                            raw_action,
                            cfg,
                            action_space=action_space,
                        )
                        plant.state.v_cmd_mps = -rpm * cfg.mps_per_rpm
                        plant.step(cfg.dt_sec)
                        reward = 1.0 if is_plant_healthy(plant, cfg) else 0.0
                    with self._lock:
                        self._inference.rpm = rpm
                        self._inference.v_cmd_mps = plant.state.v_cmd_mps
                        self._inference.lastReward = reward
                        self._inference.stepCount += 1
                    threading.Event().wait(cfg.dt_sec)
            except Exception as e:
                traceback.print_exc()
                with self._lock:
                    self._inference.error = str(e)
            finally:
                with self._lock:
                    self._inference.active = False
                    self._inference.target = None
                    self._release_policy()
                    if self._plant is not None and self._plant_lock is not None:
                        with self._plant_lock:
                            self._plant.state.v_cmd_mps = 0.0

        self._infer_thread = threading.Thread(target=run, name="rl-infer", daemon=True)
        self._infer_thread.start()
        return self.status()

    def stop_inference(self) -> dict[str, Any]:
        self._infer_stop.set()
        with self._lock:
            was_hardware = self._inference.target == "hardware"
            self._inference.active = False
            self._inference.target = None
            self._inference.rpm = 0.0
            self._inference.v_cmd_mps = 0.0
            if was_hardware or self._infer_model is not None:
                self._release_policy()
        return self.status()


def is_plant_healthy_from_raw(raw: np.ndarray, cfg: EnvConfig) -> bool:
    """Upright check from physical observation [x_m, θ, v_mps, ω] (hardware path)."""
    if not np.isfinite(raw).all():
        return False
    x_m = float(raw[0])
    theta_rad = float(raw[1])
    if abs(x_m) > cfg.x_limit_m:
        return False
    from .env import _pole_angle_error

    return abs(_pole_angle_error(theta_rad)) < cfg.healthy_angle_rad


rl_service = RlService()
