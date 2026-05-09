import { Code, ConnectError } from "@connectrpc/connect";

/** Maps Connect / network errors for the sensor-service URL (no SDK import). */
export function friendlySensorGrpcError(targetUrl: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (err instanceof ConnectError) {
    if (
      err.code === Code.Unavailable ||
      err.code === Code.DeadlineExceeded ||
      err.code === Code.Canceled
    ) {
      return `Sensor service not reachable at ${targetUrl}. Start @real-pendulum/sensor-service or set SENSOR_GRPC_URL. (${raw})`;
    }
  }
  if (
    /ECONNREFUSED|fetch failed|Failed to fetch|UNAVAILABLE|No connection established/i.test(raw) ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 14)
  ) {
    return `Sensor service not reachable at ${targetUrl}. Start @real-pendulum/sensor-service or set SENSOR_GRPC_URL. (${raw})`;
  }
  return raw;
}
