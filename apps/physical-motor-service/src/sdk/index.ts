/**
 * Connect RPC client for **`motor.v1.MotorService`** (same API the physical-motor-service HTTP server exposes).
 * Use from **`@real-pendulum/physical-motor-service/sdk`**.
 */
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import type { MotorInfo as ProtoMotorInfo } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import { MotorService } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import {
  cmPerSec2ToRpmPerSec,
  cmPerSecToRpm,
  rpmToCmPerSec,
} from "../motionUnits.js";
import {
  defaultMotorGrpcUrl,
  peekMotorGrpcBaseUrlOverride,
  withMotorGrpcBaseUrl,
} from "./grpcUrlContext.js";

export {
  defaultMotorGrpcUrl,
  normalizeMotorGrpcBaseUrl,
  setDefaultMotorGrpcUrlForTests,
  withMotorGrpcBaseUrl,
} from "./grpcUrlContext.js";

/** Normalizes active Connect **`baseUrl`** (per-request override or **`config.motor`**). */
export function motorConnectBaseUrl(): string {
  const override = peekMotorGrpcBaseUrlOverride();
  if (override) return override;
  return defaultMotorGrpcUrl();
}

let cachedBaseUrl: string | null = null;
let client: Client<typeof MotorService> | null = null;

/** Clears the cached Connect client (tests only). */
export function resetMotorGrpcClientForTests(): void {
  client = null;
  cachedBaseUrl = null;
}

function getClient() {
  const baseUrl = motorConnectBaseUrl();
  if (!client || cachedBaseUrl !== baseUrl) {
    cachedBaseUrl = baseUrl;
    const transport = createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
    });
    client = createClient(MotorService, transport);
  }
  return client;
}

/** @deprecated Prefer **`motorConnectBaseUrl()`**. */
export function motorGrpcTarget(): string {
  return motorConnectBaseUrl();
}

export async function connectMotor(): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().connect({});
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export async function disconnectMotor(): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().disconnect({});
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export async function setJogVelocityRpm(
  rpm: number,
  options?: { maxAccelerationRpmPerSec?: number },
): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().setJogVelocity({
    rpm,
    ...(options?.maxAccelerationRpmPerSec !== undefined
      ? { maxAccelerationRpmPerSec: options.maxAccelerationRpmPerSec }
      : {}),
  });
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export async function setJogVelocityCmPerSec(
  cmPerSec: number,
  options?: { maxAccelerationCmPerSec2?: number },
): Promise<{ ok: boolean; error: string }> {
  return setJogVelocityRpm(cmPerSecToRpm(cmPerSec), {
    maxAccelerationRpmPerSec:
      options?.maxAccelerationCmPerSec2 !== undefined
        ? cmPerSec2ToRpmPerSec(options.maxAccelerationCmPerSec2)
        : undefined,
  });
}

export { rpmToCmPerSec, cmPerSecToRpm } from "../motionUnits.js";

export async function stopMotor(): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().stop({});
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export type MotorInfo = {
  nodeIndex: number;
  nodeTypeCode: number;
  nodeTypeLabel: string;
  userId: string;
  firmwareVersion: string;
  serialNumber: string;
  model: string;
};

/** Maps **`MotorInfo`** from the motor service (protobuf / JSON shape). */
export function mapMotorInfo(m: ProtoMotorInfo | Record<string, unknown>): MotorInfo {
  const o = m as Record<string, unknown>;
  const serialRaw = o.serialNumber ?? o.serial_number;
  let serialNumber = "";
  if (typeof serialRaw === "bigint") {
    serialNumber = serialRaw.toString();
  } else if (serialRaw != null) {
    serialNumber = String(serialRaw);
  }
  return {
    nodeIndex: Number(o.nodeIndex ?? o.node_index ?? 0),
    nodeTypeCode: Number(o.nodeTypeCode ?? o.node_type_code ?? 0),
    nodeTypeLabel: String(o.nodeTypeLabel ?? o.node_type_label ?? ""),
    userId: String(o.userId ?? o.user_id ?? ""),
    firmwareVersion: String(o.firmwareVersion ?? o.firmware_version ?? ""),
    serialNumber,
    model: String(o.model ?? ""),
  };
}

export type MotorStatus = {
  connected: boolean;
  /** Commanded cart speed in cm/s (UI / control-api convention). */
  commandedCmPerSec: number;
  detail: string;
  motor?: MotorInfo;
  /** Teknic **`Motion.PosnMeasured`** (counts). Absent when not reported by firmware. */
  measuredPosition?: number;
};

export async function getMotorStatus(): Promise<MotorStatus> {
  const r = await getClient().getStatus({});
  return mapMotorStatus(r);
}

function mapMotorStatus(r: {
  connected: boolean;
  commandedRpm: number;
  detail?: string;
  motor?: ProtoMotorInfo;
  measuredPosition?: number;
}) {
  const commandedRpm = Number(r.commandedRpm);
  return {
    connected: r.connected,
    commandedCmPerSec: r.connected ? rpmToCmPerSec(commandedRpm) : 0,
    detail: r.detail ?? "",
    motor: r.motor ? mapMotorInfo(r.motor) : undefined,
    measuredPosition: r.measuredPosition,
  };
}

/** Consumes {@link MotorService.SubscribeStatus} server stream (Connect RPC). */
export function subscribeMotorStatus(
  onStatus: (status: ReturnType<typeof mapMotorStatus>) => void,
): () => void {
  const abort = new AbortController();
  void (async () => {
    try {
      for await (const r of getClient().subscribeStatus({}, { signal: abort.signal })) {
        onStatus(mapMotorStatus(r));
      }
    } catch {
      /* stream closed */
    }
  })();
  return () => abort.abort();
}

/** Zeros measured position at the current location (`AddToPosition(-PosnMeasured)`). */
export async function zeroMeasuredPosition(): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().zeroMeasuredPosition({});
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

/** Absolute Teknic profile move: `MovePosnStart(positionCounts, true)` (same counts frame as `measuredPosition`). */
export async function moveToPosition(
  positionCounts: number,
  options?: {
    maxVelocityCmPerSec?: number;
    maxAccelerationCmPerSec2?: number;
    /** @deprecated Prefer cm/s fields — used by in-process simulation motor gRPC. */
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
  },
): Promise<{ ok: boolean; error: string }> {
  const maxVelocityRpm =
    options?.maxVelocityRpm ??
    (options?.maxVelocityCmPerSec !== undefined
      ? cmPerSecToRpm(options.maxVelocityCmPerSec)
      : undefined);
  const maxAccelerationRpmPerSec =
    options?.maxAccelerationRpmPerSec ??
    (options?.maxAccelerationCmPerSec2 !== undefined
      ? cmPerSec2ToRpmPerSec(options.maxAccelerationCmPerSec2)
      : undefined);
  const r = await getClient().moveToPosition({
    positionCounts,
    ...(maxVelocityRpm !== undefined ? { maxVelocityRpm } : {}),
    ...(maxAccelerationRpmPerSec !== undefined
      ? { maxAccelerationRpmPerSec: maxAccelerationRpmPerSec }
      : {}),
  });
  return { ok: r.ok, error: r.errorMessage ?? "" };
}
