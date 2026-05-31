"""W3C trace propagation for stdlib http.server handlers."""

from __future__ import annotations

import os
from http import HTTPStatus
from urllib.parse import urlparse

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.propagate import extract
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import SpanKind, Status, StatusCode

_initialized = False


def init_tracing(service_name: str) -> None:
    global _initialized
    if _initialized:
        return
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318").rstrip("/")
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
    )
    trace.set_tracer_provider(provider)
    _initialized = True


class TracingMixin:
    """Mixin for BaseHTTPRequestHandler — one server span per HTTP request."""

    tracing_service_name: str = "http.server"

    def handle_one_request(self) -> None:
        try:
            self.raw_requestline = self.rfile.readline(65537)  # type: ignore[attr-defined]
        except ConnectionResetError:
            self.close_connection = True  # type: ignore[attr-defined]
            return
        if len(self.raw_requestline) > 65536:  # type: ignore[attr-defined]
            self.requestline = ""  # type: ignore[attr-defined]
            self.request_version = ""  # type: ignore[attr-defined]
            self.command = ""  # type: ignore[attr-defined]
            self.send_error(HTTPStatus.REQUEST_URI_TOO_LONG)  # type: ignore[attr-defined]
            return
        if not self.raw_requestline:  # type: ignore[attr-defined]
            self.close_connection = True  # type: ignore[attr-defined]
            return
        if not self.parse_request():  # type: ignore[attr-defined]
            return

        path = urlparse(self.path).path  # type: ignore[attr-defined]
        carrier = {k: v for k, v in self.headers.items()}  # type: ignore[attr-defined]
        ctx = extract(carrier)
        tracer = trace.get_tracer(self.tracing_service_name)
        with tracer.start_as_current_span(
            f"{self.command} {path}",  # type: ignore[attr-defined]
            context=ctx,
            kind=SpanKind.SERVER,
            attributes={
                "http.method": self.command,  # type: ignore[attr-defined]
                "http.route": path,
            },
        ) as span:
            self._active_trace_id = format(span.get_span_context().trace_id, "032x")
            try:
                mname = "do_" + self.command  # type: ignore[attr-defined]
                if not hasattr(self, mname):
                    self.send_error(  # type: ignore[attr-defined]
                        HTTPStatus.NOT_IMPLEMENTED,
                        f"Unsupported method ({self.command!r})",  # type: ignore[attr-defined]
                    )
                    return
                method = getattr(self, mname)
                method()
                self.wfile.flush()  # type: ignore[attr-defined]
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR, str(exc)))
                raise

    def end_headers(self) -> None:
        trace_id = getattr(self, "_active_trace_id", None)
        if trace_id:
            self.send_header("x-trace-id", trace_id)  # type: ignore[attr-defined]
        super().end_headers()  # type: ignore[misc]
