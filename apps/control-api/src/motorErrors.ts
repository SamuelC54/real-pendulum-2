import { Code, ConnectError } from "@connectrpc/connect";

/** Maps Connect / network errors to operator-facing messages (no motor client import). */
export function friendlyMotorGrpcError(targetUrl: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (err instanceof ConnectError) {
    if (
      err.code === Code.Unavailable ||
      err.code === Code.DeadlineExceeded ||
      err.code === Code.Canceled
    ) {
      return `Motor service not reachable at ${targetUrl}. Start @real-pendulum/motor-service (same machine as control-api) or set MOTOR_GRPC_URL. (${raw})`;
    }
  }
  if (
    /ECONNREFUSED|fetch failed|Failed to fetch|UNAVAILABLE|No connection established/i.test(raw) ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 14)
  ) {
    return `Motor service not reachable at ${targetUrl}. Start @real-pendulum/motor-service (same machine as control-api) or set MOTOR_GRPC_URL. (${raw})`;
  }
  return raw;
}
