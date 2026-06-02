import { controllerServiceHttpBaseUrl } from "@real-pendulum/app-config";
import { tracedFetch } from "@real-pendulum/tracing/fetch";

export type ControllerMeta = {
  id: string;
  name: string;
  description: string;
  defaultParams: Record<string, number>;
  paramLabels?: Record<string, string>;
  paramDescriptions?: Record<string, string>;
  paramOrder?: string[];
};

export type ControllerStatus = {
  active: boolean;
  id: string | null;
  name: string | null;
  startedAt: number | null;
  stepCount: number;
  error: string | null;
};

export type ControllerTickResult = {
  idle?: boolean;
  positionCm?: number;
  cmPerSec?: number;
  maxVelocityCmPerSec?: number;
  maxAccelerationCmPerSec2?: number;
  done?: boolean;
  streamPosition?: boolean;
  minCommandDeltaCm?: number;
  error?: string;
  log?: string[];
  motorAbsRevolutions?: number;
  homingResult?: {
    posAtLeft: number;
    posAtRight: number;
    motorSpanCounts: number;
    midMotorPosition: number;
    zeroMotorAtMid: boolean;
  };
};

function baseUrl(): string {
  const raw = process.env.CONTROLLER_SERVICE_URL?.trim();
  if (raw) return raw.startsWith("http") ? raw : `http://${raw}`;
  return controllerServiceHttpBaseUrl();
}

async function controllerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await tracedFetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`controller-service ${path} failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function controllerServiceHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function controllerServiceList(): Promise<ControllerMeta[]> {
  const body = await controllerFetch<{ controllers: ControllerMeta[] }>("/controllers/list");
  return body.controllers;
}

export async function controllerServiceStatus(): Promise<ControllerStatus> {
  return controllerFetch<ControllerStatus>("/controllers/status");
}

export async function controllerServiceStart(
  id: string,
  params: Record<string, number>,
): Promise<ControllerStatus> {
  return controllerFetch<ControllerStatus>("/controllers/start", {
    method: "POST",
    body: JSON.stringify({ id, params }),
  });
}

export async function controllerServiceStop(): Promise<ControllerStatus> {
  return controllerFetch<ControllerStatus>("/controllers/stop", {
    method: "POST",
    body: "{}",
  });
}

export async function controllerServiceTick(state: {
  positionCm: number;
  timeSec: number;
  measuredPosition?: number;
  limitLeftPressed?: boolean;
  limitRightPressed?: boolean;
  cartConnected?: boolean;
  sensorConnected?: boolean;
  encoderTicks?: number;
}): Promise<ControllerTickResult> {
  return controllerFetch<ControllerTickResult>("/controllers/tick", {
    method: "POST",
    body: JSON.stringify(state),
  });
}

/** @deprecated use controller-service client */
export type PhysicsSimControllerMeta = ControllerMeta;
/** @deprecated use controller-service client */
export type PhysicsSimControllerStatus = ControllerStatus;
/** @deprecated use controller-service client */
export type PhysicsSimControllerTickResult = ControllerTickResult;
