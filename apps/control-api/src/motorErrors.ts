/** Maps low-level gRPC errors to operator-facing messages (no motor client import). */
export function friendlyMotorGrpcError(grpcTarget: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    /ECONNREFUSED|UNAVAILABLE|No connection established/i.test(raw) ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 14)
  ) {
    return `Motor gRPC not reachable at ${grpcTarget}. Start @real-pendulum/motor-service (same machine as control-api) or set MOTOR_GRPC_URL. (${raw})`;
  }
  return raw;
}
