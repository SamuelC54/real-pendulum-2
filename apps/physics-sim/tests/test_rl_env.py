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

    action = np.array([100.0 / 1500.0], dtype=np.float32)
    obs2, reward, term, trunc, info2 = env.step(action)
    assert abs(info2["rpm"] - 100.0) < 1.0
    assert obs2.shape == (4,)
    assert np.isfinite(reward)
    assert isinstance(term, bool)
    assert isinstance(trunc, bool)
    assert "rpm" in info2
    assert "reward_survive" in info2
    env.close()


def test_balance_healthy_reward_and_termination():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=100))
    env.reset(seed=0, options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0})
    assert is_plant_healthy(env.plant, env.cfg)
    _, reward, terminated, _, info = env.step(np.array([0.0], dtype=np.float32))
    assert reward >= 1.0
    assert info["reward_survive"] == 1.0
    assert not terminated

    env.plant.state.theta_rad = UPRIGHT_THETA_RAD + 0.5
    env.plant.sync_state_to_mujoco()
    assert not is_plant_healthy(env.plant, env.cfg)
    _, reward2, terminated2, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert reward2 < 1.0
    assert not terminated2
    env.close()


def test_reset_noise_scale():
    env = CartPendulumRpmEnv(config=EnvConfig(reset_noise_scale=0.01))
    env.reset(seed=42)
    assert abs(env.plant.state.x_m) <= 0.02
    assert abs(env.plant.state.theta_rad) <= 0.02
    env.close()


def test_balance_reset_starts_hanging_not_terminated():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=50))
    _, _ = env.reset(seed=0)
    assert abs(env.plant.state.theta_rad) < 0.05
    _, _, terminated, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert not terminated
    env.close()


def test_balance_edge_terminates_with_penalty():
    env = CartPendulumRpmEnv(config=EnvConfig(x_limit_m=0.45, edge_penalty=2.0))
    env.reset(seed=0, options={"initial_x_m": 0.46, "initial_theta_rad": 0.0})
    _, reward, terminated, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert terminated
    assert reward < 0.0
    env.close()


def test_balance_center_and_upright_reward():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            center_reward=0.1,
            upright_reward=1.0,
            center_radius_m=0.2,
        )
    )
    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0},
    )
    _, reward, terminated, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert reward >= 1.0 + 0.05
    assert not terminated
    env.close()


def test_max_rpm_default():
    env = CartPendulumRpmEnv()
    assert env.cfg.max_rpm == 1500.0
    assert float(env.action_space.high[0]) == 1.0
    env.close()


def test_swing_up_shaping_reward():
    env = CartPendulumRpmEnv(config=EnvConfig(swing_up_reward=0.5, upright_reward=0.0))
    env.reset(seed=0)
    _, r_hang, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    env.plant.state.theta_rad = UPRIGHT_THETA_RAD - 0.1
    env.plant.sync_state_to_mujoco()
    _, r_near, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert r_near > r_hang
    env.close()


def test_rpm_from_policy_action():
    cfg = EnvConfig(max_rpm=1500.0)
    from rl.env import rpm_from_policy_action

    assert rpm_from_policy_action(0.5, cfg, action_space="normalized") == 750.0
    assert rpm_from_policy_action(400.0, cfg, action_space="rpm") == 400.0
    assert rpm_from_policy_action(400.0, cfg, action_space=None) == 400.0
