import { physicsSimHttpBaseUrl } from "@real-pendulum/app-config";
import { tracedFetch } from "@real-pendulum/tracing/fetch";
import type { CartPendulumConfig, CartPendulumPlant, CartPendulumState } from "./cartPendulumTypes.js";

export type PhysicsSimStatePayload = {
  state: CartPendulumState;
  config: CartPendulumConfig;
};

function physicsSimBaseUrl(): string {
  const raw = process.env.PHYSICS_SIM_URL?.trim();
  if (raw) return raw.startsWith("http") ? raw : `http://${raw}`;
  return physicsSimHttpBaseUrl();
}

async function physicsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await tracedFetch(`${physicsSimBaseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`simulation ${path} failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function applyPhysicsPayloadToPlant(
  plant: CartPendulumPlant,
  payload: PhysicsSimStatePayload,
): void {
  Object.assign(plant.state, payload.state);
  Object.assign(plant.config as CartPendulumConfig, payload.config);
}

export async function physicsSimHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${physicsSimBaseUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function physicsSimReset(options: {
  config?: Partial<CartPendulumConfig>;
  initial?: Partial<CartPendulumState>;
}): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/reset", {
    method: "POST",
    body: JSON.stringify({
      config: options.config,
      initial: options.initial,
    }),
  });
}

export async function physicsSimStep(options: {
  dt: number;
  vCmdMps?: number;
}): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/step", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/** Absolute cart move via MuJoCo position actuator (cart_pos), not qpos teleport. */
export async function physicsSimMoveAbsolute(options: {
  xM: number;
  toleranceM?: number;
  maxVelocityMps?: number;
  maxTimeSec?: number;
}): Promise<PhysicsSimStatePayload & { arrived: boolean }> {
  return physicsFetch<PhysicsSimStatePayload & { arrived: boolean }>("/move_absolute", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function physicsSimPatchConfig(
  plantPatch: Partial<CartPendulumConfig>,
): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/config", {
    method: "PATCH",
    body: JSON.stringify({ plant: plantPatch }),
  });
}

export async function physicsSimGetState(): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/state");
}
