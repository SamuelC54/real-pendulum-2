import math

import numpy as np
import pytest

from rl.env import (
    CartPendulumRpmEnv,
    CurriculumConfig,
    DomainRandomizationConfig,
    EnvConfig,
    RewardConfig,
    UPRIGHT_THETA_RAD,
    is_balanced,
    is_state_valid,
    parse_normalized_action,
    pendulum_energy_j,
    policy_observation_from_logged_state,
    rpm_from_normalized_action,
    upright_target_energy_j,
)


def _quiet_rewards(**overrides: float) -> RewardConfig:
    """Reward config with non-essential terms disabled for isolated tests."""
    base = dict(
        upright_reward=0.0,
        center_reward=0.0,
        angle_progress_reward=0.0,
        rail_position_penalty=0.0,
        rail_velocity_penalty=0.0,
        energy_error_penalty=0.0,
        balance_velocity_penalty=0.0,
        balance_omega_penalty=0.0,
        rpm_penalty=0.0,
        rpm_delta_penalty=0.0,
        success_upright_sec=0.0,
        success_bonus=0.0,
    )
    base.update(overrides)
    return RewardConfig(**base)


def test_env_reset_step_shape():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=10))
    obs, info = env.reset(seed=0)
    assert obs.shape == (5,)
    assert "raw_state" in info
    assert len(info["raw_state"]) == 4
    assert "is_state_valid" in info
    assert "is_balanced" in info
    assert obs[1] == pytest.approx(math.sin(env.plant.state.theta_rad), abs=1e-5)
    assert obs[2] == pytest.approx(math.cos(env.plant.state.theta_rad), abs=1e-5)

    action = np.array([100.0 / 1500.0], dtype=np.float32)
    obs2, reward, term, trunc, info2 = env.step(action)
    assert abs(info2["rpm"] - 100.0) < 1.0
    assert obs2.shape == (5,)
    assert np.isfinite(reward)
    assert isinstance(term, bool)
    assert isinstance(trunc, bool)
    assert "upright_reward" in info2
    env.close()


def test_balance_reward_and_validity():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            max_episode_steps=100,
            rewards=_quiet_rewards(upright_reward=1.0),
        )
    )
    env.reset(seed=0, options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0})
    assert is_state_valid(env.plant, env.cfg)
    assert is_balanced(env.plant, env.cfg)
    _, reward, terminated, _, info = env.step(np.array([0.0], dtype=np.float32))
    assert reward == pytest.approx(1.0, rel=0.02)
    assert info["upright_reward"] == pytest.approx(1.0, rel=0.02)
    assert not terminated

    env.plant.state.theta_rad = UPRIGHT_THETA_RAD + 0.5
    env.plant.sync_state_to_mujoco()
    assert is_state_valid(env.plant, env.cfg)
    assert not is_balanced(env.plant, env.cfg)
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
    env = CartPendulumRpmEnv(
        config=EnvConfig(x_limit_m=0.2, rewards=RewardConfig(limit_penalty=10.0)),
    )
    env.reset(seed=0, options={"initial_x_m": 0.21, "initial_theta_rad": 0.0})
    _, reward, terminated, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert terminated
    assert reward <= -10.0
    env.close()


def test_spin_rev_accumulates_without_termination():
    env = CartPendulumRpmEnv(config=EnvConfig(rewards=_quiet_rewards()))
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.0})
    env._prev_theta_rad = 0.0
    env.plant.state.theta_rad = math.pi
    env.plant.sync_state_to_mujoco()
    result = env._compute_reward(0.0)
    assert not result.terminated
    assert result.total == pytest.approx(0.0, abs=1e-3)
    assert env._spin_rev_accum == pytest.approx(0.5, rel=0.02)
    env.close()


def test_spin_over_two_revs_does_not_terminate():
    env = CartPendulumRpmEnv(config=EnvConfig(rewards=_quiet_rewards()))
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.0})
    env._prev_theta_rad = 0.0
    env._spin_rev_accum = 2.0
    env.plant.state.theta_rad = math.pi
    env.plant.sync_state_to_mujoco()
    result = env._compute_reward(0.0)
    assert not result.terminated
    assert env._spin_rev_accum > 2.0
    env.close()


def test_center_reward_only_when_upright():
    env = CartPendulumRpmEnv(
        config=EnvConfig(rewards=_quiet_rewards(center_reward=0.4)),
    )
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.0})
    _, r_hang, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert r_hang == pytest.approx(0.0, abs=0.05)

    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0},
    )
    _, r_upright, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert r_upright >= 0.35
    env.close()


def test_balance_center_and_upright_reward():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            x_limit_m=0.2,
            rewards=_quiet_rewards(center_reward=0.1, upright_reward=1.0),
        )
    )
    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0},
    )
    _, reward_center, terminated, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert reward_center >= 1.0 + 0.05
    assert not terminated

    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.1},
    )
    _, reward_offset, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert reward_offset < reward_center
    env.close()


def test_max_rpm_default():
    env = CartPendulumRpmEnv()
    assert env.cfg.max_rpm == 1500.0
    assert float(env.action_space.high[0]) == 1.0
    env.close()


def test_upright_reward_scales_with_angle():
    env = CartPendulumRpmEnv(
        config=EnvConfig(rewards=_quiet_rewards(upright_reward=1.0)),
    )
    env.reset(seed=0)
    _, r_hang, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    env.plant.state.theta_rad = UPRIGHT_THETA_RAD - 0.1
    env.plant.sync_state_to_mujoco()
    _, r_near, _, _, _ = env.step(np.array([0.0], dtype=np.float32))
    assert r_near > r_hang
    env.close()


def test_high_rpm_penalty_reduces_reward():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            max_rpm=1500.0,
            rewards=_quiet_rewards(rpm_penalty=0.5, upright_reward=1.0),
        )
    )
    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0},
    )
    _, r_low, _, _, _ = env.step(np.array([50.0 / 1500.0], dtype=np.float32))
    env.reset(
        seed=0,
        options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0},
    )
    _, r_high, _, _, info = env.step(np.array([1.0], dtype=np.float32))
    assert r_high < r_low
    assert info["rpm_penalty"] > 0.0
    env.close()


def test_rpm_from_normalized_action():
    cfg = EnvConfig(max_rpm=1500.0)
    assert rpm_from_normalized_action(0.5, cfg) == 750.0
    assert rpm_from_normalized_action(-1.0, cfg) == -1500.0


def test_env_config_validation():
    with pytest.raises(ValueError, match="dt_sec"):
        EnvConfig(dt_sec=0.0)
    with pytest.raises(ValueError, match="x_limit_m"):
        EnvConfig(x_limit_m=-0.1)
    with pytest.raises(ValueError, match="observation scales"):
        EnvConfig(x_obs_scale=0.0)


def test_action_shape_validation():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=5))
    env.reset(seed=0)
    with pytest.raises(ValueError, match="single action"):
        env.step(np.array([0.0, 0.0], dtype=np.float32))
    env.close()


def test_parse_normalized_action_accepts_sb3_batch_shape():
    assert parse_normalized_action(np.array([[0.5]], dtype=np.float32)) == 0.5


def test_parse_normalized_action_rejects_wrong_size():
    with pytest.raises(ValueError, match="single action"):
        parse_normalized_action(np.array([0.0, 0.0], dtype=np.float32))


def test_policy_observation_from_logged_state():
    cfg = EnvConfig()
    raw = np.array([0.1, math.pi / 2, 0.0, 0.0], dtype=np.float32)
    obs = policy_observation_from_logged_state(raw, cfg)
    assert obs.shape == (5,)
    assert obs[0] == pytest.approx(0.1 / cfg.x_obs_scale, rel=0.01)
    assert obs[1] == pytest.approx(1.0, abs=1e-5)
    assert obs[2] == pytest.approx(0.0, abs=1e-5)


def test_reset_initial_velocity():
    env = CartPendulumRpmEnv(config=EnvConfig(max_episode_steps=5))
    env.reset(
        seed=0,
        options={
            "initial_v_mps": 0.42,
            "initial_omega_rps": -1.5,
        },
    )
    assert env.plant.state.v_mps == pytest.approx(0.42)
    assert env.plant.state.omega_rps == pytest.approx(-1.5)
    env.close()


def test_angle_progress_reward():
    env = CartPendulumRpmEnv(
        config=EnvConfig(rewards=_quiet_rewards(angle_progress_reward=2.0)),
    )
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.0})
    env._prev_theta_rad = 0.0
    env.plant.state.theta_rad = UPRIGHT_THETA_RAD - 0.5
    env.plant.sync_state_to_mujoco()
    result = env._compute_reward(0.0)
    assert result.angle_progress_reward > 0.0
    assert result.total > 0.0
    env.close()


def test_curriculum_balance_reset():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            curriculum=CurriculumConfig(enabled=True, phase="balance"),
            max_episode_steps=5,
        ),
    )
    _, info = env.reset(seed=0)
    assert info["curriculum_phase"] == "balance"
    assert abs(env.plant.state.theta_rad - UPRIGHT_THETA_RAD) < 0.15
    env.close()


def test_curriculum_swing_up_reset():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            curriculum=CurriculumConfig(enabled=True, phase="swing_up"),
            max_episode_steps=5,
        ),
    )
    env.reset(seed=0)
    assert abs(env.plant.state.theta_rad) < 0.1
    env.close()


def test_set_curriculum_phase():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            curriculum=CurriculumConfig(enabled=True, phase="recovery"),
            max_episode_steps=5,
        ),
    )
    env.set_curriculum_phase("recovery")
    env.reset(seed=0)
    assert abs(env.plant.state.theta_rad - UPRIGHT_THETA_RAD) < 0.6
    env.close()


def test_energy_penalty_when_not_upright():
    env = CartPendulumRpmEnv(
        config=EnvConfig(rewards=_quiet_rewards(energy_error_penalty=1.0)),
    )
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.0})
    env._prev_theta_rad = 0.0
    result = env._compute_reward(0.0)
    target = upright_target_energy_j(env.cfg.gravity, env.cfg.pendulum_length_m)
    energy = pendulum_energy_j(0.0, 0.0, gravity=env.cfg.gravity, length_m=env.cfg.pendulum_length_m)
    assert result.energy_penalty == pytest.approx(abs(target - energy), rel=0.02)
    env.close()


def test_success_bonus_after_sustained_upright():
    cfg = EnvConfig(
        dt_sec=0.1,
        rewards=_quiet_rewards(success_upright_sec=0.2, success_bonus=25.0),
        max_episode_steps=50,
    )
    env = CartPendulumRpmEnv(config=cfg)
    env.reset(seed=0, options={"initial_theta_rad": UPRIGHT_THETA_RAD, "initial_x_m": 0.0})
    env._upright_steps = 1
    result = env._compute_reward(0.0)
    assert result.success_reward == pytest.approx(25.0)
    assert result.terminated
    env.close()


def test_domain_randomization_changes_plant():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            domain_randomization=DomainRandomizationConfig(
                enabled=True,
                pendulum_length_scale=(1.1, 1.1),
            ),
            max_episode_steps=5,
        ),
    )
    base_len = env.cfg.pendulum_length_m
    env.reset(seed=0)
    assert env._episode_length_m == pytest.approx(base_len * 1.1)
    assert env.plant.config.pendulum_length_m == pytest.approx(base_len * 1.1)
    env.close()


def test_rail_velocity_penalty_toward_limit():
    env = CartPendulumRpmEnv(
        config=EnvConfig(
            x_limit_m=0.2,
            rewards=_quiet_rewards(rail_velocity_penalty=1.0),
        ),
    )
    env.reset(seed=0, options={"initial_theta_rad": 0.0, "initial_x_m": 0.1})
    env._prev_theta_rad = 0.0
    env.plant.state.v_mps = 0.5
    env.plant.sync_state_to_mujoco()
    result = env._compute_reward(0.0)
    assert result.rail_velocity_penalty > 0.0
    env.close()
