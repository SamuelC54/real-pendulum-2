/**
 * Connect RPC client for **`motor.v1.MotorService`** (same API the motor-service HTTP server exposes).
 * Use from **`@real-pendulum/motor-service/sdk`**.
 */
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import type { MotorInfo as ProtoMotorInfo } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import { MotorService } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import {
  defaultMotorGrpcUrlFromEnv,
  peekMotorGrpcBaseUrlOverride,
  withMotorGrpcBaseUrl,
} from "./grpcUrlContext.js";

export {
  defaultMotorGrpcUrlFromEnv,
  normalizeMotorGrpcBaseUrl,
  withMotorGrpcBaseUrl,
} from "./grpcUrlContext.js";

/** Normalizes active Connect **`baseUrl`** (per-request override or **`MOTOR_GRPC_URL`**). */
export function motorConnectBaseUrl(): string {
  const override = peekMotorGrpcBaseUrlOverride();
  if (override) return override;
  return defaultMotorGrpcUrlFromEnv();
}

let cachedBaseUrl: string | null = null;
let client: Client<typeof MotorService> | null = null;

/** Clears the cached Connect client so **`MOTOR_GRPC_URL`** changes take effect (tests only). */
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

export async function setJogVelocityRpm(rpm: number): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().setJogVelocity({ rpm });
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

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

export async function getMotorStatus(): Promise<{
  connected: boolean;
  commandedRpm: number;
  detail: string;
  motor?: MotorInfo;
  /** Teknic **`Motion.PosnMeasured`** (counts). Absent when not reported by firmware. */
  measuredPosition?: number;
}> {
  const r = await getClient().getStatus({});
  return {
    connected: r.connected,
    commandedRpm: Number(r.commandedRpm),
    detail: r.detail ?? "",
    motor: r.motor ? mapMotorInfo(r.motor) : undefined,
    measuredPosition: r.measuredPosition,
  };
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
    maxVelocityRpm?: number;
    maxAccelerationRpmPerSec?: number;
  },
): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().moveToPosition({
    positionCounts,
    ...(options?.maxVelocityRpm !== undefined
      ? { maxVelocityRpm: options.maxVelocityRpm }
      : {}),
    ...(options?.maxAccelerationRpmPerSec !== undefined
      ? { maxAccelerationRpmPerSec: options.maxAccelerationRpmPerSec }
      : {}),
  });
  return { ok: r.ok, error: r.errorMessage ?? "" };
}
