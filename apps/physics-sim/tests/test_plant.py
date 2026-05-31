import math

from cart_pendulum.plant import CartPendulumPlant, PlantConfig


def test_pendulum_oscillates():
    plant = CartPendulumPlant(
        config=PlantConfig(
            pendulum_length_m=0.25,
            gravity=9.81,
            angular_damping_per_sec=0.0,
            cart_velocity_tracking_per_sec=100.0,
        )
    )
    plant.state.v_cmd_mps = 0.0
    plant.state.theta_rad = 0.1
    plant.state.omega_rps = 0.0
    plant.sync_state_to_mujoco()

    dt = 1 / 500
    initial = plant.state.theta_rad
    expected_half = math.pi * math.sqrt(0.25 / 9.81)
    max_steps = math.ceil(expected_half * 1.35 / dt)
    for _ in range(max_steps):
        plant.step(dt)
    assert initial * plant.state.theta_rad < 0


def test_resting_pendulum_hangs_vertical():
    plant = CartPendulumPlant(
        config=PlantConfig(
            pendulum_length_m=0.35,
            cart_velocity_tracking_per_sec=12.0,
            angular_damping_per_sec=0.04,
        )
    )
    plant.state.v_cmd_mps = 0.0
    plant.state.theta_rad = 0.0
    plant.state.omega_rps = 0.0
    plant.sync_state_to_mujoco()

    dt = 1 / 240
    for _ in range(480):
        plant.step(dt)

    assert abs(plant.state.theta_rad) < 0.02
    assert abs(plant.encoder_ticks_int()) < 50


def test_pendulum_swing_does_not_backdrive_cart():
    plant = CartPendulumPlant(
        config=PlantConfig(
            pendulum_length_m=0.35,
            angular_damping_per_sec=0.0,
            cart_velocity_tracking_per_sec=100.0,
        )
    )
    plant.state.v_cmd_mps = 0.0
    plant.state.x_m = 0.0
    plant.state.v_mps = 0.0
    plant.state.theta_rad = 0.35
    plant.state.omega_rps = 0.0
    plant.sync_state_to_mujoco()

    dt = 1 / 240
    for _ in range(600):
        plant.step(dt)

    assert abs(plant.state.x_m) < 0.005
    assert abs(plant.state.v_mps) < 0.05


def test_move_to_setpoint_uses_position_actuator():
    plant = CartPendulumPlant(
        config=PlantConfig(
            pendulum_length_m=0.35,
            cart_velocity_tracking_per_sec=40.0,
        )
    )
    plant.state.x_m = 0.0
    plant.state.v_mps = 0.0
    plant.state.theta_rad = 0.12
    plant.state.omega_rps = 0.0
    plant.sync_state_to_mujoco()

    short = plant.move_to_setpoint(
        0.08,
        tolerance_m=1e-6,
        max_time_sec=plant.config.max_internal_step_sec * 0.5,
    )
    assert not short
    assert abs(plant.state.x_m - 0.08) > 0.02

    arrived = plant.move_to_setpoint(0.08, tolerance_m=0.002, max_time_sec=5.0)
    assert arrived
    assert abs(plant.state.x_m - 0.08) < 0.003


def test_limit_switches_use_mujoco_touch():
    plant = CartPendulumPlant(
        config=PlantConfig(
            limit_left_x_m=-0.5,
            limit_right_x_m=0.5,
            cart_velocity_tracking_per_sec=80.0,
        )
    )
    plant.state.v_cmd_mps = 0.0
    plant.sync_state_to_mujoco()
    assert not plant.state.limit_left_pressed
    assert not plant.state.limit_right_pressed

    plant.move_to_setpoint(-0.5, tolerance_m=0.01, max_time_sec=8.0)
    assert plant.state.limit_left_pressed
    assert not plant.state.limit_right_pressed

    plant.move_to_setpoint(0.5, tolerance_m=0.01, max_time_sec=8.0)
    assert plant.state.limit_right_pressed


def test_cart_motion_couples_to_pendulum():
    plant = CartPendulumPlant(
        config=PlantConfig(
            pendulum_length_m=0.4,
            cart_velocity_tracking_per_sec=4.0,
            angular_damping_per_sec=0.01,
        )
    )
    plant.state.theta_rad = 0.05
    plant.state.omega_rps = 0.0
    plant.state.v_cmd_mps = 0.25
    plant.sync_state_to_mujoco()
    for _ in range(40):
        plant.step(1 / 200)
    assert abs(plant.state.omega_rps) > 0.02
    assert plant.encoder_ticks_int() != 0
