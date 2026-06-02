import { AsyncLocalStorage } from "node:async_hooks";
import { getControlBackend } from "../control/getControlBackend.js";
import type { ControlBackend, ControlMode } from "../control/types.js";

export type { ControlMode };

type Store = { mode: ControlMode };

const als = new AsyncLocalStorage<Store>();

export function withControlBackend<T>(
  mode: ControlMode,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return als.run({ mode }, fn);
}

export function getBackend(): ControlBackend {
  const mode = als.getStore()?.mode;
  if (!mode) {
    throw new Error("No control backend in context");
  }
  return getControlBackend(mode);
}
