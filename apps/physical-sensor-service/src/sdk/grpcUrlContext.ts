import { AsyncLocalStorage } from "node:async_hooks";
import { sensorGrpcBaseUrl } from "@real-pendulum/app-config";

const als = new AsyncLocalStorage<{ baseUrl: string }>();

let testDefaultSensorGrpcUrl: string | undefined;

/** Overrides default sensor gRPC URL for integration tests. */
export function setDefaultSensorGrpcUrlForTests(url: string | undefined): void {
  testDefaultSensorGrpcUrl = url;
}

export function normalizeSensorGrpcBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return sensorGrpcBaseUrl();
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

export function defaultSensorGrpcUrl(): string {
  if (testDefaultSensorGrpcUrl) {
    return normalizeSensorGrpcBaseUrl(testDefaultSensorGrpcUrl);
  }
  return normalizeSensorGrpcBaseUrl(sensorGrpcBaseUrl());
}

/** Runs **`fn`** with Connect **`baseUrl`** fixed to **`baseUrl`** (per-request override). */
export function withSensorGrpcBaseUrl<T>(baseUrl: string, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ baseUrl: normalizeSensorGrpcBaseUrl(baseUrl) }, fn);
}

export function peekSensorGrpcBaseUrlOverride(): string | undefined {
  return als.getStore()?.baseUrl;
}
