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
  ) as InstanceType<grpc.ServiceClientConstructor>;
  return client;
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

export async function getMotorStatus(): Promise<{
  connected: boolean;
  commandedRpm: number;
  detail: string;
}> {
  return new Promise((resolve, reject) => {
    getClient().GetStatus({}, (err: grpc.ServiceError | null, res: unknown) => {
      if (err) return reject(err);
      const r = res as { connected: boolean; commanded_rpm: number; detail: string };
      resolve({
        connected: r.connected,
        commandedRpm: Number(r.commanded_rpm),
        detail: r.detail ?? "",
      });
    });
  });
}
