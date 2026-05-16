import { AsyncLocalStorage } from "node:async_hooks";

export type GrpcBackendMode = "hardware" | "sim" | "twin";

type Store = { mode: GrpcBackendMode };

const als = new AsyncLocalStorage<Store>();

export function withGrpcBackendMode<T>(mode: GrpcBackendMode, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ mode }, fn);
}

export function getGrpcBackendMode(): GrpcBackendMode {
  return als.getStore()?.mode ?? "hardware";
}
