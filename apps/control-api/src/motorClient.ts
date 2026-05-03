import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = path.resolve(__dirname, "../../../proto");
const MOTOR_PROTO = path.join(PROTO_ROOT, "motor.proto");

let client: InstanceType<
  grpc.ServiceClientConstructor
> | null = null;

/** Clears the cached gRPC client so `MOTOR_GRPC_URL` changes take effect (tests only). */
export function resetMotorGrpcClientForTests(): void {
  client = null;
}

function getClient() {
  if (client) return client;
  const packageDefinition = protoLoader.loadSync(MOTOR_PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as {
    motor: { v1: { MotorService: grpc.ServiceClientConstructor } };
  };
  const ctor = loaded.motor.v1.MotorService;
  const target = process.env.MOTOR_GRPC_URL ?? "127.0.0.1:50051";
  client = new ctor(
    target,
    grpc.credentials.createInsecure(),
    {
      "grpc.keepalive_time_ms": 10_000,
      "grpc.keepalive_timeout_ms": 5_000,
    },
  ) as InstanceType<grpc.ServiceClientConstructor>;
  return client;
}

export function motorGrpcTarget(): string {
  return process.env.MOTOR_GRPC_URL ?? "127.0.0.1:50051";
}

export async function connectMotor(): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve, reject) => {
    getClient().Connect({}, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as { ok: boolean; error_message: string };
      resolve({ ok: r.ok, error: r.error_message ?? "" });
    });
  });
}

export async function disconnectMotor(): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve, reject) => {
    getClient().Disconnect({}, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as { ok: boolean; error_message: string };
      resolve({ ok: r.ok, error: r.error_message ?? "" });
    });
  });
}

export async function setJogVelocityRpm(rpm: number): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve, reject) => {
    getClient().SetJogVelocity({ rpm }, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as { ok: boolean; error_message: string };
      resolve({ ok: r.ok, error: r.error_message ?? "" });
    });
  });
}

export async function stopMotor(): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve, reject) => {
    getClient().Stop({}, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as { ok: boolean; error_message: string };
      resolve({ ok: r.ok, error: r.error_message ?? "" });
    });
  });
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

export function mapMotorInfo(m: {
  node_index?: number;
  node_type_code?: number;
  node_type_label?: string;
  user_id?: string;
  firmware_version?: string;
  serial_number?: number | string;
  model?: string;
}): MotorInfo {
  return {
    nodeIndex: Number(m.node_index ?? 0),
    nodeTypeCode: Number(m.node_type_code ?? 0),
    nodeTypeLabel: String(m.node_type_label ?? ""),
    userId: String(m.user_id ?? ""),
    firmwareVersion: String(m.firmware_version ?? ""),
    serialNumber: m.serial_number != null ? String(m.serial_number) : "",
    model: String(m.model ?? ""),
  };
}

export async function getMotorStatus(): Promise<{
  connected: boolean;
  commandedRpm: number;
  detail: string;
  motor?: MotorInfo;
}> {
  return new Promise((resolve, reject) => {
    getClient().GetStatus({}, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as {
        connected: boolean;
        commanded_rpm: number;
        detail: string;
        motor?: Parameters<typeof mapMotorInfo>[0];
      };
      resolve({
        connected: r.connected,
        commandedRpm: Number(r.commanded_rpm),
        detail: r.detail ?? "",
        motor: r.motor ? mapMotorInfo(r.motor) : undefined,
      });
    });
  });
}
