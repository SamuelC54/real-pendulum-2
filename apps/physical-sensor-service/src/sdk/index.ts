/**
 * Connect RPC client for **`sensor.v1.SensorService`** (same API as physical-sensor-service HTTP server).
 */
import { create } from "@bufbuild/protobuf";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ConnectRequestSchema,
  SensorService,
} from "@real-pendulum/motor-proto/gen/sensor_pb.js";
import {
  defaultSensorGrpcUrl,
  peekSensorGrpcBaseUrlOverride,
  withSensorGrpcBaseUrl,
} from "./grpcUrlContext.js";

export {
  defaultSensorGrpcUrl,
  normalizeSensorGrpcBaseUrl,
  setDefaultSensorGrpcUrlForTests,
  withSensorGrpcBaseUrl,
} from "./grpcUrlContext.js";

/** Normalizes active Connect **`baseUrl`** (per-request override or **`config.sensor`**). */
export function sensorConnectBaseUrl(): string {
  const override = peekSensorGrpcBaseUrlOverride();
  if (override) return override;
  return defaultSensorGrpcUrl();
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

/** Uses **`serialPort`** when set; otherwise falls back to **`config.sensor.serialPort`**. */
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
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
}> {
  const r = await getClient().getStatus({});
  return mapSensorStatus(r);
}

function mapSensorStatus(r: {
  connected: boolean;
  ledOn: boolean;
  detail?: string;
  serialPort?: string;
  encoderTicks?: number;
  limitLeftPressed?: boolean;
  limitRightPressed?: boolean;
}) {
  return {
    connected: r.connected,
    ledOn: r.ledOn,
    detail: r.detail ?? "",
    serialPort: r.serialPort ?? "",
    encoderTicks: r.encoderTicks ?? 0,
    limitLeftPressed: r.limitLeftPressed ?? false,
    limitRightPressed: r.limitRightPressed ?? false,
  };
}

/** Consumes {@link SensorService.SubscribeStatus} server stream (Connect RPC). */
export function subscribeSensorStatus(
  onStatus: (status: ReturnType<typeof mapSensorStatus>) => void,
): () => void {
  const abort = new AbortController();
  void (async () => {
    try {
      for await (const r of getClient().subscribeStatus({}, { signal: abort.signal })) {
        onStatus(mapSensorStatus(r));
      }
    } catch {
      /* stream closed */
    }
  })();
  return () => abort.abort();
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
