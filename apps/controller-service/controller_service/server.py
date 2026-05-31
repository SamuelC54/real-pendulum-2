"""HTTP API for rail closed-loop controllers (LQR, go-to-center, …)."""

from __future__ import annotations

import argparse
import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from service_tracing import TracingMixin, init_tracing

from rail_controllers import service as controller_service


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


class ControllerServiceHandler(TracingMixin, BaseHTTPRequestHandler):
    tracing_service_name = "controller-service"
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def handle(self) -> None:
        try:
            super().handle()
        except ConnectionResetError:
            pass

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            _json_response(self, 200, {"ok": True})
            return
        if path == "/controllers/list":
            _json_response(self, 200, {"controllers": controller_service.list_controllers()})
            return
        if path == "/controllers/status":
            _json_response(self, 200, controller_service.status())
            return
        _json_response(self, 404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = _read_json(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "invalid json"})
            return

        if not path.startswith("/controllers/"):
            _json_response(self, 404, {"error": "not found"})
            return

        try:
            if path == "/controllers/start":
                controller_id = body.get("id")
                if not controller_id:
                    _json_response(self, 400, {"error": "id required"})
                    return
                params = body.get("params") or {}
                out = controller_service.start(str(controller_id), params)
            elif path == "/controllers/stop":
                out = controller_service.stop()
            elif path == "/controllers/tick":
                position_cm = body.get("positionCm")
                if position_cm is None:
                    _json_response(self, 400, {"error": "positionCm required"})
                    return
                tick_state: dict[str, Any] = {
                    "positionCm": float(position_cm),
                    "timeSec": float(body.get("timeSec", 0)),
                }
                for key in (
                    "measuredPosition",
                    "limitLeftPressed",
                    "limitRightPressed",
                    "cartConnected",
                    "sensorConnected",
                    "encoderTicks",
                ):
                    if key in body:
                        tick_state[key] = body[key]
                out = controller_service.tick(tick_state)
            else:
                _json_response(self, 404, {"error": "not found"})
                return
        except Exception as e:
            traceback.print_exc()
            _json_response(self, 500, {"error": str(e)})
            return
        _json_response(self, 200, out)


def main() -> None:
    init_tracing("controller-service")
    parser = argparse.ArgumentParser(description="Rail controller HTTP service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=58872)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), ControllerServiceHandler)
    print(f"[controller-service] at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
