"""HTTP API for the live MuJoCo plant (used by motor-service and control-api)."""

from __future__ import annotations

import argparse
import json
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from .plant import CartPendulumPlant, PlantConfig, PlantState
from .calibrate import fit_twin_calibration_params
from .replay import replay_twin_trace

_live_plant = CartPendulumPlant()
_live_lock = threading.Lock()
_replay_defaults: dict[str, float] = {
    "gravity": 9.80665,
    "encoderTicksPerRadian": 2400.0 / (2.0 * 3.141592653589793),
    "limitLeftXM": -0.2,
    "limitRightXM": 0.2,
}


def _json_response(handler: BaseHTTPRequestHandler, code: int, body: Any) -> None:
    raw = json.dumps(body).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def _read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", 0))
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


def _state_payload() -> dict[str, Any]:
    s = _live_plant.state
    c = _live_plant.config
    return {
        "state": {
            "xM": s.x_m,
            "vMps": s.v_mps,
            "thetaRad": s.theta_rad,
            "omegaRps": s.omega_rps,
            "vCmdMps": s.v_cmd_mps,
            "encoderTicksFloat": s.encoder_ticks_float,
        },
        "config": {
            "gravity": c.gravity,
            "pendulumLengthM": c.pendulum_length_m,
            "cartVelocityTrackingPerSec": c.cart_velocity_tracking_per_sec,
            "angularDampingPerSec": c.angular_damping_per_sec,
            "encoderTicksPerRadian": c.encoder_ticks_per_radian,
            "maxInternalStepSec": c.max_internal_step_sec,
        },
    }


class PhysicsSimHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            _json_response(self, 200, {"ok": True, "engine": "mujoco"})
            return
        if path == "/state":
            with _live_lock:
                payload = _state_payload()
            _json_response(self, 200, payload)
            return
        _json_response(self, 404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = _read_json(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "invalid json"})
            return

        if path == "/step":
            dt = float(body.get("dt", 0))
            with _live_lock:
                if "vCmdMps" in body:
                    _live_plant.state.v_cmd_mps = float(body["vCmdMps"])
                _live_plant.step(dt)
            _json_response(self, 200, _state_payload())
            return

        if path == "/reset":
            initial = body.get("initial") or {}
            with _live_lock:
                tpr = _live_plant.config.encoder_ticks_per_radian
                theta = float(initial.get("thetaRad", 0))
                if "encoderTicksFloat" in initial and "thetaRad" not in initial:
                    enc = float(initial["encoderTicksFloat"])
                    theta = enc / tpr
                else:
                    enc = float(initial.get("encoderTicksFloat", theta * tpr))
                _live_plant.state = PlantState(
                    x_m=float(initial.get("xM", 0)),
                    v_mps=float(initial.get("vMps", 0)),
                    theta_rad=theta,
                    omega_rps=float(initial.get("omegaRps", 0)),
                    v_cmd_mps=float(initial.get("vCmdMps", 0)),
                    encoder_ticks_float=enc,
                )
                if body.get("config"):
                    _live_plant.patch_config(body["config"])
                _live_plant.sync_state_to_mujoco()
                _live_plant.sync_encoder_from_theta()
            _json_response(self, 200, _state_payload())
            return

        if path == "/replay":
            try:
                samples = body.get("samples") or []
                params = body.get("params") or {}
                defaults = {**_replay_defaults, **(body.get("defaults") or {})}
                trace = replay_twin_trace(
                    samples,
                    params,
                    gravity=float(defaults["gravity"]),
                    encoder_ticks_per_radian=float(defaults["encoderTicksPerRadian"]),
                    limit_left_x_m=float(defaults["limitLeftXM"]),
                    limit_right_x_m=float(defaults["limitRightXM"]),
                )
            except Exception as e:
                traceback.print_exc()
                _json_response(self, 500, {"error": str(e)})
                return
            _json_response(
                self,
                200,
                {
                    "trace": [
                        {"motorCm": p.motor_cm, "encoderTicks": p.encoder_ticks} for p in trace
                    ]
                },
            )
            return

        if path == "/calibrate":
            try:
                samples = body.get("samples") or []
                start = body.get("start") or body.get("params") or {}
                weights = body.get("weights") or {"position": 1.0, "encoder": 0.5}
                defaults = {**_replay_defaults, **(body.get("defaults") or {})}
                fit = fit_twin_calibration_params(samples, start, weights, defaults)
            except Exception as e:
                traceback.print_exc()
                _json_response(self, 500, {"error": str(e)})
                return
            _json_response(self, 200, {"fit": fit})
            return

        _json_response(self, 404, {"error": "not found"})

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        if path != "/config":
            _json_response(self, 404, {"error": "not found"})
            return
        try:
            body = _read_json(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "invalid json"})
            return
        plant_patch = body.get("plant") or body
        with _live_lock:
            _live_plant.patch_config(plant_patch)
        _json_response(self, 200, _state_payload())


def main() -> None:
    parser = argparse.ArgumentParser(description="MuJoCo cart–pendulum physics HTTP service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=58871)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), PhysicsSimHandler)
    print(f"[physics-sim] MuJoCo plant at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
