import { physicsSimHttpBaseUrl } from "@real-pendulum/app-config";
import { tracedFetch } from "@real-pendulum/tracing/fetch";
import type { CartPendulumConfig, CartPendulumPlant, CartPendulumState } from "./cartPendulumTypes.js";
import { cmPerSecToMps, cmToM, mpsToCmPerSec, mToCm } from "./motionUnits.js";

export type PhysicsSimStatePayload = {
  state: CartPendulumState;
  config: CartPendulumConfig;
};

/** Cart/pendulum state with rail position and speeds in cm (and angle in rad from plant). */
export type PhysicsSimStateCm = {
  xCm: number;
  vCmPerSec: number;
  thetaRad: number;
  omegaRadPerSec: number;
  vCmdCmPerSec: number;
  encoderTicks: number;
  limitLeftPressed?: boolean;
  limitRightPressed?: boolean;
};

export function physicsStateToCm(state: CartPendulumState): PhysicsSimStateCm {
  return {
    xCm: mToCm(state.xM),
    vCmPerSec: mpsToCmPerSec(state.vMps),
    thetaRad: state.thetaRad,
    omegaRadPerSec: state.omegaRps,
    vCmdCmPerSec: mpsToCmPerSec(state.vCmdMps),
    encoderTicks: Math.round(state.encoderTicksFloat),
    limitLeftPressed: state.limitLeftPressed,
    limitRightPressed: state.limitRightPressed,
  };
}

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
  vCmdCmPerSec?: number;
}): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/step", {
    method: "POST",
    body: JSON.stringify({
      dt: options.dt,
      ...(options.vCmdCmPerSec !== undefined
        ? { vCmdMps: cmPerSecToMps(options.vCmdCmPerSec) }
        : {}),
    }),
  });
}

/** Absolute cart move via MuJoCo position actuator (cart_pos), not qpos teleport. */
export async function physicsSimMoveAbsolute(options: {
  xCm: number;
  toleranceCm?: number;
  maxVelocityCmPerSec?: number;
  maxTimeSec?: number;
}): Promise<PhysicsSimStatePayload & { arrived: boolean }> {
  return physicsFetch<PhysicsSimStatePayload & { arrived: boolean }>("/move_absolute", {
    method: "POST",
    body: JSON.stringify({
      xM: cmToM(options.xCm),
      ...(options.toleranceCm !== undefined ? { toleranceM: cmToM(options.toleranceCm) } : {}),
      ...(options.maxVelocityCmPerSec !== undefined
        ? { maxVelocityMps: cmPerSecToMps(options.maxVelocityCmPerSec) }
        : {}),
      ...(options.maxTimeSec !== undefined ? { maxTimeSec: options.maxTimeSec } : {}),
    }),
  });
}

export async function physicsSimGetState(): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/state");
}

export async function physicsSimPatchConfig(
  patch: Partial<CartPendulumConfig> | Record<string, unknown>,
): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/config", {
    method: "PATCH",
    body: JSON.stringify({ plant: patch }),
  });
}
