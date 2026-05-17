"""
Run a trained policy in the MuJoCo viewer (legacy-style ``--gen`` flag).

Example::

    cd apps/physics-sim
    python -m rl.render_ai --gen 42
    python -m rl.render_ai --gen latest
"""

from __future__ import annotations

import argparse
import time

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

from rl.env import CartPendulumRpmEnv, EnvConfig
from rl.paths import generation_dir, generation_model_path, latest_generation, load_meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Render trained cart–pendulum policy")
    parser.add_argument(
        "--gen",
        required=True,
        help="Generation number under rl/gen/, or 'latest'",
    )
    parser.add_argument("--steps", type=int, default=50_000)
    parser.add_argument("--realtime", action="store_true", help="Sleep to match sim dt")
    parser.add_argument("--task", choices=("balance", "center"), default=None)
    args = parser.parse_args()

    if args.gen == "latest":
        gen = latest_generation()
        if gen is None:
            raise SystemExit("No generations found in rl/gen/")
    else:
        gen = int(args.gen)

    model_path = generation_model_path(gen)
    if not model_path.is_file():
        raise SystemExit(f"Missing {model_path}. Train with: python -m rl.train")

    meta = load_meta(gen)
    cfg = EnvConfig(task=args.task or meta.get("task", "balance"))
    base = CartPendulumRpmEnv(config=cfg, render_mode="human")
    vec_path = generation_dir(gen) / "vecnormalize.pkl"
    if meta.get("normalized") and vec_path.is_file():
        vec = DummyVecEnv([lambda: base])
        vec = VecNormalize.load(str(vec_path), vec)
        vec.training = False
        vec.norm_reward = False
        env = vec
        model = PPO.load(model_path, env=env)
    else:
        env = base
        model = PPO.load(model_path, env=env)

    obs, _ = env.reset()
    print(f"[rl] generation {gen} — meta: {meta}")
    render_env = base if meta.get("normalized") else env
    try:
        for step in range(args.steps):
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, term, trunc, info = env.step(action)
            if isinstance(info, list):
                info = info[0]
            render_env.render()
            if args.realtime:
                time.sleep(cfg.dt_sec)
            done = bool(term) if np.isscalar(term) else bool(term[0])
            done = done or (bool(trunc) if np.isscalar(trunc) else bool(trunc[0]))
            if done:
                obs, _ = env.reset()
            if step % 500 == 0:
                raw = info.get("raw_obs")
                rpm = float(info.get("rpm", 0.0))
                print(
                    f"  step {step}: reward={reward:.3f} rpm={rpm:.0f} "
                    f"raw_obs={np.round(raw, 4) if raw is not None else '?'}"
                )
    finally:
        env.close()


if __name__ == "__main__":
    main()
