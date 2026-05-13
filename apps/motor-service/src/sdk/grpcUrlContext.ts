import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ baseUrl: string }>();

export function normalizeMotorGrpcBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "http://127.0.0.1:50051";
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

export function defaultMotorGrpcUrlFromEnv(): string {
  return normalizeMotorGrpcBaseUrl(process.env.MOTOR_GRPC_URL ?? "127.0.0.1:50051");
}

/** Runs **`fn`** with Connect **`baseUrl`** fixed to **`baseUrl`** (per-request override). */
export function withMotorGrpcBaseUrl<T>(baseUrl: string, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ baseUrl: normalizeMotorGrpcBaseUrl(baseUrl) }, fn);
}

export function peekMotorGrpcBaseUrlOverride(): string | undefined {
  return als.getStore()?.baseUrl;
}
