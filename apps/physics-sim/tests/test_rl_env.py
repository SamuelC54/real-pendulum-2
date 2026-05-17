import math

import numpy as np

from rl.env import (
    CartPendulumRpmEnv,
    EnvConfig,
    UPRIGHT_THETA_RAD,
    is_plant_healthy,
)


def test_env_reset_step_shape():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=10))
    obs, info = env.reset(seed=0)
    assert obs.shape == (4,)
    assert "raw_obs" in info
    assert len(info["raw_obs"]) == 4
    assert "is_healthy" in info

    action = np.array([100.0], dtype=np.float32)
    obs2, reward, term, trunc, info2 = env.step(action)
    assert obs2.shape == (4,)
    assert np.isfinite(reward)
    assert isinstance(term, bool)
    assert isinstance(trunc, bool)
    assert "rpm" in info2
    assert "reward_survive" in info2
    env.close()


def test_balance_healthy_reward_and_termination():
    env = CartPendulumRpmEnv(config=EnvConfig(task="balance", max_episode_steps=100))
    env.reset(seed=0, options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0})
    assert is_plant_healthy(env.plant, env.cfg)
    _, reward, terminated, _, info = env.step(np.array([0.0], dtype=np.float32))
    assert reward == 1.0
    assert info["reward_survive"] == 1.0
    assert not terminated

    env.plant.state.theta_rad = UPRIGHT_THETA_RAD + 0.5
    env.plant.sync_state_to_mujoco()
    assert not is_plant_healthy(env.plant, env.cfg)
    _, reward2, terminated2, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert reward2 == 0.0
    assert terminated2
    env.close()


def test_reset_noise_scale():
    env = CartPendulumRpmEnv(config=EnvConfig(reset_noise_scale=0.01))
    env.reset(seed=42)
    assert abs(env.plant.state.x_m) <= 0.02
    assert abs(env.plant.state.theta_rad - math.pi) <= 0.02
    env.close()
