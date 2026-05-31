import { context, propagation, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

/** Initialize OTLP export + W3C trace propagation for a Node service. Idempotent. */
export function initNodeTracing(serviceName: string): void {
  if (sdk) return;

  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318").replace(
    /\/$/,
    "",
  );

  sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  });
  sdk.start();

  const shutdown = () => {
    void sdk?.shutdown();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** Inject W3C `traceparent` / `tracestate` into outbound HTTP headers. */
export function injectTraceHeaders(headers: HeadersInit = {}): Record<string, string> {
  const carrier: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      carrier[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      carrier[key] = value;
    }
  } else {
    Object.assign(carrier, headers);
  }
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** 32-char hex trace id for the active span, if any. */
export function getActiveTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  const id = span?.spanContext().traceId;
  return id && id !== "00000000000000000000000000000000" ? id : undefined;
}

export function getTracer(name: string) {
  return trace.getTracer(name);
}

/** Run fn inside a new active span (child of current context). */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer("real-pendulum");
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }
    try {
      return await fn(span);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
