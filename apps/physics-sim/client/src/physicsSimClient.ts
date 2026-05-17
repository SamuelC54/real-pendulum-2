import { physicsSimHttpBaseUrl } from "@real-pendulum/app-config";
import type { CartPendulumConfig, CartPendulumPlant, CartPendulumState } from "./cartPendulumTypes.js";

export type PhysicsSimStatePayload = {
  state: CartPendulumState;
  config: CartPendulumConfig;
};

export type PhysicsReplayPoint = { motorCm: number; encoderTicks: number };

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

export async function physicsSimPatchConfig(
  plantPatch: Partial<CartPendulumConfig>,
): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/config", {
    method: "PATCH",
    body: JSON.stringify({ plant: plantPatch }),
  });
}

export async function physicsSimReplay(options: {
  samples: unknown[];
  params: Record<string, number>;
  defaults?: Record<string, number>;
}): Promise<PhysicsReplayPoint[]> {
  const body = await physicsFetch<{ trace: PhysicsReplayPoint[] }>("/replay", {
    method: "POST",
    body: JSON.stringify(options),
  });
  return body.trace;
}

export type PhysicsSimCalibrationFit = {
  params: Record<string, number>;
  score: number;
};

export type PhysicsSimRlStatus = {
  training: {
    active: boolean;
    timesteps: number;
    totalTimesteps: number;
    latestGeneration: number | null;
    error: string | null;
  };
  inference: {
    active: boolean;
    generation: number | null;
    rpm: number;
    lastReward: number;
    stepCount: number;
    error: string | null;
  };
  metrics: { timesteps: number; meanReward: number; generation: number | null }[];
  generations: number[];
};

export async function physicsSimRlStatus(): Promise<PhysicsSimRlStatus> {
  return physicsFetch<PhysicsSimRlStatus>("/rl/status");
}

export async function physicsSimRlTrainStart(body: {
  totalTimesteps?: number;
  saveEvery?: number;
  nEnvs?: number;
  task?: string;
}): Promise<PhysicsSimRlStatus> {
  return physicsFetch<PhysicsSimRlStatus>("/rl/train/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function physicsSimRlTrainStop(): Promise<PhysicsSimRlStatus> {
  return physicsFetch<PhysicsSimRlStatus>("/rl/train/stop", { method: "POST", body: "{}" });
}

export async function physicsSimRlInferenceStart(generation: number): Promise<PhysicsSimRlStatus> {
  return physicsFetch<PhysicsSimRlStatus>("/rl/inference/start", {
    method: "POST",
    body: JSON.stringify({ generation }),
  });
}

export async function physicsSimRlInferenceStop(): Promise<PhysicsSimRlStatus> {
  return physicsFetch<PhysicsSimRlStatus>("/rl/inference/stop", { method: "POST", body: "{}" });
}

export async function physicsSimGetState(): Promise<PhysicsSimStatePayload> {
  return physicsFetch<PhysicsSimStatePayload>("/state");
}

export async function physicsSimCalibrate(options: {
  samples: unknown[];
  start: Record<string, number>;
  weights?: { position: number; encoder: number };
  defaults?: Record<string, number>;
}): Promise<PhysicsSimCalibrationFit | null> {
  const body = await physicsFetch<{ fit: PhysicsSimCalibrationFit | null }>("/calibrate", {
    method: "POST",
    body: JSON.stringify(options),
  });
  return body.fit;
}
