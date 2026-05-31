import type { IncomingMessage, ServerResponse } from "node:http";
import { context, propagation, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

/** Wrap an Node HTTP handler: extract incoming trace, start server span, set x-trace-id. */
export function wrapHttpHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  tracerName = "http.server",
): (req: IncomingMessage, res: ServerResponse) => void {
  const tracer = trace.getTracer(tracerName);
  return (req, res) => {
    const url = req.url ?? "/";
    const parentCtx = propagation.extract(context.active(), req.headers);
    const span = tracer.startSpan(
      `${req.method ?? "GET"} ${url}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": req.method ?? "GET",
          "http.target": url,
        },
      },
      parentCtx,
    );
    const ctx = trace.setSpan(parentCtx, span);
    res.setHeader("x-trace-id", span.spanContext().traceId);

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      span.setAttribute("http.status_code", res.statusCode);
      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    };
    res.once("finish", finish);
    res.once("close", finish);

    context.with(ctx, () => {
      try {
        const result = handler(req, res);
        if (result instanceof Promise) {
          void result.catch((err) => {
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.setStatus({ code: SpanStatusCode.ERROR });
          });
        }
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      }
    });
  };
}
