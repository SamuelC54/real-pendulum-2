# Physics sim (MuJoCo)

Python **MuJoCo** cart–pendulum engine used by the simulation gRPC stack.

## Setup

From the repo root, `npm run dev` starts the full stack in Docker (simulation, controller-service, control-api, web, Portainer).

For native processes without Docker: `npm run dev:local`.

Optional virtualenv (local Python dev):

```bash
cd apps/simulation
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Run

```bash
python -m cart_pendulum.server --port 58871
```

`npm run dev` (Docker) or `npm run dev:local` starts this service as part of the stack.

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
