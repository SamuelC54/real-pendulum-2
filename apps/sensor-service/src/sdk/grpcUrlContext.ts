import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ baseUrl: string }>();

export function normalizeSensorGrpcBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "http://127.0.0.1:50052";
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

export function defaultSensorGrpcUrlFromEnv(): string {
  return normalizeSensorGrpcBaseUrl(process.env.SENSOR_GRPC_URL ?? "127.0.0.1:50052");
}

/** Runs **`fn`** with Connect **`baseUrl`** fixed to **`baseUrl`** (per-request override). */
export function withSensorGrpcBaseUrl<T>(baseUrl: string, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ baseUrl: normalizeSensorGrpcBaseUrl(baseUrl) }, fn);
}

export function peekSensorGrpcBaseUrlOverride(): string | undefined {
  return als.getStore()?.baseUrl;
}
