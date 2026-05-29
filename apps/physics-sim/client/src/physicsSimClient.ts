import { physicsSimHttpBaseUrl } from "@real-pendulum/app-config";
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
  const res = await fetch(`${physicsSimBaseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`physics-sim ${path} failed (${res.status}): ${text || res.statusText}`);
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

export type PhysicsSimControllerMeta = {
  id: string;
  name: string;
  description: string;
  defaultParams: Record<string, number>;
  paramLabels?: Record<string, string>;
  paramDescriptions?: Record<string, string>;
  paramOrder?: string[];
};

export type PhysicsSimControllerStatus = {
  active: boolean;
  id: string | null;
  name: string | null;
  startedAt: number | null;
  stepCount: number;
  error: string | null;
};

export type PhysicsSimControllerTickResult = {
  idle?: boolean;
  positionCm?: number;
  maxVelocityRpm?: number;
  maxAccelerationRpmPerSec?: number;
  done?: boolean;
  /** When true, issue a new move when the setpoint changes (e.g. LQR). */
  streamPosition?: boolean;
  minCommandDeltaCm?: number;
};

export async function physicsSimControllersList(): Promise<PhysicsSimControllerMeta[]> {
  const body = await physicsFetch<{ controllers: PhysicsSimControllerMeta[] }>("/controllers/list");
  return body.controllers;
}

export async function physicsSimControllersStatus(): Promise<PhysicsSimControllerStatus> {
  return physicsFetch<PhysicsSimControllerStatus>("/controllers/status");
}

export async function physicsSimControllersStart(
  id: string,
  params: Record<string, number>,
): Promise<PhysicsSimControllerStatus> {
  return physicsFetch<PhysicsSimControllerStatus>("/controllers/start", {
    method: "POST",
    body: JSON.stringify({ id, params }),
  });
}

export async function physicsSimControllersStop(): Promise<PhysicsSimControllerStatus> {
  return physicsFetch<PhysicsSimControllerStatus>("/controllers/stop", {
    method: "POST",
    body: "{}",
  });
}

export async function physicsSimControllersTick(state: {
  positionCm: number;
  timeSec: number;
  encoderTicks?: number;
}): Promise<PhysicsSimControllerTickResult> {
  return physicsFetch<PhysicsSimControllerTickResult>("/controllers/tick", {
    method: "POST",
    body: JSON.stringify(state),
  });
}

export async function physicsSimGetState(): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/state");
}
