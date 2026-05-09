/**
 * Connect RPC client for **`sensor.v1.SensorService`** (same API as sensor-service HTTP server).
 */
import { create } from "@bufbuild/protobuf";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ConnectRequestSchema,
  SensorService,
} from "@real-pendulum/motor-proto/gen/sensor_pb.js";

/** Normalizes **`SENSOR_GRPC_URL`** for Connect (expects **`http(s)://`**). */
export function sensorConnectBaseUrl(): string {
  const raw = process.env.SENSOR_GRPC_URL ?? "127.0.0.1:50052";
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `http://${raw}`;
}

let cachedBaseUrl: string | null = null;
let client: Client<typeof SensorService> | null = null;

/** Clears cached client (tests). */
export function resetSensorGrpcClientForTests(): void {
  client = null;
  cachedBaseUrl = null;
}

function getClient() {
  const baseUrl = sensorConnectBaseUrl();
  if (!client || cachedBaseUrl !== baseUrl) {
    cachedBaseUrl = baseUrl;
    const transport = createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
    });
    client = createClient(SensorService, transport);
  }
  return client;
}

/** Uses **`serialPort`** when set; otherwise falls back to **`SENSOR_SERIAL_PORT`**. */
export async function connectSensor(serialPort?: string): Promise<{
  ok: boolean;
  error: string;
}> {
  const r = await getClient().connect(
    create(ConnectRequestSchema, {
      serialPort: serialPort?.trim() ?? "",
    }),
  );
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export async function listSerialPorts(): Promise<
  Array<{
    path: string;
    manufacturer: string;
    serialNumber: string;
    friendlyName: string;
  }>
> {
  const r = await getClient().listSerialPorts({});
  return r.ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer ?? "",
    serialNumber: p.serialNumber ?? "",
    friendlyName: p.friendlyName ?? "",
  }));
}

export async function disconnectSensor(): Promise<{ ok: boolean; error: string }> {
  const r = await getClient().disconnect({});
  return { ok: r.ok, error: r.errorMessage ?? "" };
}

export async function toggleLed(): Promise<{ ok: boolean; error: string; ledOn: boolean }> {
  const r = await getClient().toggleLed({});
  return { ok: r.ok, error: r.errorMessage ?? "", ledOn: r.ledOn };
}

export async function getSensorStatus(): Promise<{
  connected: boolean;
  ledOn: boolean;
  detail: string;
  serialPort: string;
  encoderTicks: number;
}> {
  const r = await getClient().getStatus({});
  return {
    connected: r.connected,
    ledOn: r.ledOn,
    detail: r.detail ?? "",
    serialPort: r.serialPort ?? "",
    encoderTicks: r.encoderTicks ?? 0,
  };
}

export async function resetEncoder(): Promise<{
  ok: boolean;
  error: string;
  encoderTicks: number;
}> {
  const r = await getClient().resetEncoder({});
  return {
    ok: r.ok,
    error: r.errorMessage ?? "",
    encoderTicks: r.encoderTicks ?? 0,
  };
}
