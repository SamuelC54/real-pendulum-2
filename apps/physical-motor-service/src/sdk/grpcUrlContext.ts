import { AsyncLocalStorage } from "node:async_hooks";
import { motorGrpcBaseUrl } from "@real-pendulum/app-config";

const als = new AsyncLocalStorage<{ baseUrl: string }>();

let testDefaultMotorGrpcUrl: string | undefined;

/** Overrides default motor gRPC URL for integration tests. */
export function setDefaultMotorGrpcUrlForTests(url: string | undefined): void {
  testDefaultMotorGrpcUrl = url;
}

export function normalizeMotorGrpcBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return motorGrpcBaseUrl();
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

export function defaultMotorGrpcUrl(): string {
  if (testDefaultMotorGrpcUrl) {
    return normalizeMotorGrpcBaseUrl(testDefaultMotorGrpcUrl);
  }
  return normalizeMotorGrpcBaseUrl(motorGrpcBaseUrl());
}

/** Runs **`fn`** with Connect **`baseUrl`** fixed to **`baseUrl`** (per-request override). */
export function withMotorGrpcBaseUrl<T>(baseUrl: string, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ baseUrl: normalizeMotorGrpcBaseUrl(baseUrl) }, fn);
}

export function peekMotorGrpcBaseUrlOverride(): string | undefined {
  return als.getStore()?.baseUrl;
}
