"""
Train a PPO policy with Stable-Baselines3.

Checkpoints are saved as generations under ``rl/gen/<n>/`` (model.zip + meta.json).

Example::

    cd apps/physics-sim
    pip install -r requirements-rl.txt
    python -m rl.train --total-timesteps 500000 --save-every 10000
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecNormalize

from rl.env import CartPendulumRpmEnv, EnvConfig
from rl.paths import GEN_DIR, generation_dir, latest_generation


class GenerationCallback(BaseCallback):
    """Save numbered generations under ``rl/gen/<n>/model.zip``."""

    def __init__(
        self,
        save_every: int,
        start_gen: int = 1,
        task: str = "balance",
        verbose: int = 0,
    ) -> None:
        super().__init__(verbose)
        self.save_every = max(1, save_every)
        self._next_gen = start_gen
        self._last_saved = 0
        self.task = task

    def _on_step(self) -> bool:
        if self.num_timesteps - self._last_saved < self.save_every:
            return True
        self._last_saved = self.num_timesteps
        dest = generation_dir(self._next_gen)
        dest.mkdir(parents=True, exist_ok=True)
        model_path = dest / "model.zip"
        self.model.save(str(model_path))
        venv = self.training_env
        if isinstance(venv, VecNormalize):
            venv.save(str(dest / "vecnormalize.pkl"))
        meta = {
            "timesteps": self.num_timesteps,
            "generation": self._next_gen,
            "algorithm": "PPO",
            "task": self.task,
            "normalized": isinstance(venv, VecNormalize),
        }
        (dest / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        if self.verbose:
            print(f"[rl] saved generation {self._next_gen} @ {self.num_timesteps} steps")
        self._next_gen += 1
        return True


def _build_env(cfg: EnvConfig, seed: int) -> CartPendulumRpmEnv:
    return CartPendulumRpmEnv(config=cfg)

def main() -> None:
    parser = argparse.ArgumentParser(description="Train cart–pendulum PPO (SB3)")
    parser.add_argument("--total-timesteps", type=int, default=500_000)
    parser.add_argument("--save-every", type=int, default=10_000, help="Steps between generations")
    parser.add_argument("--n-envs", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--task", choices=("balance", "center"), default="balance")
    parser.add_argument("--no-normalize", action="store_true")
    parser.add_argument("--resume", type=int, default=None, help="Continue from rl/gen/<n>/model.zip")
    args = parser.parse_args()

    cfg = EnvConfig(task=args.task)
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    (GEN_DIR / "_latest").mkdir(parents=True, exist_ok=True)

    def make_env() -> CartPendulumRpmEnv:
        return _build_env(cfg, args.seed)

    vec = make_vec_env(make_env, n_envs=args.n_envs, seed=args.seed)
    if not args.no_normalize:
        vec = VecNormalize(vec, norm_obs=True, norm_reward=True, clip_obs=5.0)

    start_gen = (latest_generation() or 0) + 1
    if args.resume is not None:
        model_path = generation_dir(args.resume) / "model.zip"
        if not model_path.is_file():
            raise SystemExit(f"Missing checkpoint: {model_path}")
        model = PPO.load(model_path, env=vec)
        start_gen = args.resume + 1
        print(f"[rl] resumed from generation {args.resume}")
    else:
        model = PPO(
            "MlpPolicy",
            vec,
            verbose=1,
            seed=args.seed,
            n_steps=2048,
            batch_size=256,
            gamma=0.99,
            learning_rate=3e-4,
            ent_coef=0.01,
        )

    checkpoint = CheckpointCallback(
        save_freq=max(args.save_every // args.n_envs, 1),
        save_path=str(GEN_DIR / "_latest"),
        name_prefix="model",
        save_replay_buffer=False,
        save_vecnormalize=True,
    )
    callbacks = [
        checkpoint,
        GenerationCallback(
            save_every=args.save_every,
            start_gen=start_gen,
            task=args.task,
            verbose=1,
        ),
    ]

    model.learn(total_timesteps=args.total_timesteps, callback=callbacks, progress_bar=True)

    final_gen = latest_generation()
    if final_gen is not None:
        meta_path = generation_dir(final_gen) / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
        meta["finished"] = True
        meta["total_timesteps"] = args.total_timesteps
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"[rl] done — latest generation: {final_gen}")


if __name__ == "__main__":
    main()
