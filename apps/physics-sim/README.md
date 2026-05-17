# Physics sim (MuJoCo)

Python **MuJoCo** cart–pendulum engine used by the coupled gRPC sim and twin calibration replay.

## Setup

From the repo root, `npm run dev` runs `pip install -r apps/physics-sim/requirements.txt` automatically (`predev`).

Optional virtualenv:

```bash
cd apps/physics-sim
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Run

```bash
python -m cart_pendulum.server --port 58871
```

`npm run dev` also starts this service before the coupled sim.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/state` | Live plant state + config |
| POST | `/step` | `{ "dt", "vCmdMps"? }` — advance live plant |
| POST | `/reset` | `{ "initial"?, "config"? }` — reset live plant |
| PATCH | `/config` | Patch plant parameters |
| POST | `/replay` | Stateless replay for calibration (`samples`, `params`, `defaults`) |
| POST | `/calibrate` | SciPy parameter fit (`samples`, `start`, `weights?`, `defaults?`) → `{ fit }` |

The **live** plant is a singleton in the server process. **Replay** builds a fresh plant per request.

## Reinforcement learning (optional)

Uses [Gymnasium](https://gymnasium.farama.org/) + [Stable-Baselines3](https://stable-baselines3.readthedocs.io/) (PPO).

```bash
cd apps/physics-sim
pip install -r requirements-rl.txt
python -m rl.train --total-timesteps 500000 --save-every 10000
python -m rl.render_ai --gen latest --realtime
```

- **Observation (4):** cart x, θ, cart vx, ω (MuJoCo qpos/qvel, like [InvertedPendulum-v5](https://gymnasium.farama.org/environments/mujoco/inverted_pendulum/))  
- **Balance reward:** +1 per step while |θ − π| &lt; 0.2 rad (survival); episode ends when unhealthy  
- **Action (1):** motor RPM (±4000) → `vCmdMps = -rpm × mpsPerRpm`  
- **Generations:** `rl/gen/<n>/model.zip` + `meta.json`

Legacy-style render: `python -m rl.render_ai --gen 12170` once that generation exists.
