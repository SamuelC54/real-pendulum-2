# Physics sim (MuJoCo)

Python **MuJoCo** cart–pendulum engine used by the coupled gRPC sim.

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
| POST | `/move_absolute` | `{ "xM", "toleranceM"?, "maxTimeSec"? }` — cart_pos setpoint + physics steps |

The **live** plant is a singleton in the server process.
