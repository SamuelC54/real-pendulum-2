import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = path.resolve(__dirname, "../../../../proto");
const MOTOR_PROTO = path.join(PROTO_ROOT, "motor.proto");

function loadMotorServiceCtor(): grpc.ServiceClientConstructor {
  const packageDefinition = protoLoader.loadSync(MOTOR_PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as Record<
    string,
    grpc.GrpcObject | grpc.ServiceClientConstructor
  >;
  const motorNs = loaded.motor as grpc.GrpcObject;
  const v1 = motorNs.v1 as grpc.GrpcObject;
  return v1.MotorService as grpc.ServiceClientConstructor;
}

/** Wire shape for embedded motor info (matches `motor.proto` / gRPC JSON-style keys). */
export type MotorInfoWire = {
  node_index: number;
  node_type_code: number;
  node_type_label: string;
  user_id: string;
  firmware_version: string;
  serial_number: number;
  model: string;
};

/** Mutable in-memory motor service used by the fake server (no DLL / hardware). */
export type FakeMotorGrpcModel = {
  /** Reply sent by `Connect` (and whether `Connect` marks `connected`). */
  connectReply: { ok: boolean; error_message: string };
  connected: boolean;
  commandedRpm: number;
  detail: string;
  motor?: MotorInfoWire;
};

export function createFakeMotorGrpcModel(
  partial?: Partial<FakeMotorGrpcModel>,
): FakeMotorGrpcModel {
  return {
    connectReply: { ok: true, error_message: "" },
    connected: false,
    commandedRpm: 0,
    detail: "fake motor service",
    ...partial,
  };
}

export type StartFakeMotorGrpcOptions = {
  /** When set, bind this port on loopback (e.g. **50051** for E2E). Omit or **0** for an ephemeral port. */
  port?: number;
};

/**
 * In-process `MotorService` for integration tests (same `.proto` as **motor service** / `apps/motor-service`).
 * Binds to **`127.0.0.1:0`** (ephemeral) unless **`options.port`** is a positive port number.
 */
export function startFakeMotorGrpcServer(
  model: FakeMotorGrpcModel,
  options?: StartFakeMotorGrpcOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const explicit = options?.port;
  const bindAddr =
    explicit != null && explicit > 0 ? `127.0.0.1:${explicit}` : "127.0.0.1:0";

  const MotorCtor = loadMotorServiceCtor();
  const server = new grpc.Server();

  const impl: grpc.UntypedServiceImplementation = {
    Connect: (_call, cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>) => {
      if (model.connectReply.ok) model.connected = true;
      cb(null, model.connectReply);
    },
    Disconnect: (_call, cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>) => {
      model.connected = false;
      cb(null, { ok: true, error_message: "" });
    },
    SetJogVelocity: (
      call: grpc.ServerUnaryCall<{ rpm: number }, unknown>,
      cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>,
    ) => {
      model.commandedRpm = call.request.rpm ?? 0;
      cb(null, { ok: true, error_message: "" });
    },
    Stop: (_call, cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>) => {
      model.commandedRpm = 0;
      cb(null, { ok: true, error_message: "" });
    },
    GetStatus: (
      _call,
      cb: grpc.sendUnaryData<{
        connected: boolean;
        commanded_rpm: number;
        detail: string;
        motor?: MotorInfoWire;
      }>,
    ) => {
      cb(null, {
        connected: model.connected,
        commanded_rpm: model.commandedRpm,
        detail: model.detail,
        motor: model.motor,
      });
    },
  };

  server.addService(MotorCtor.service, impl);

  return new Promise((resolve, reject) => {
    server.bindAsync(
      bindAddr,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          url: `127.0.0.1:${port}`,
          close: () =>
            new Promise<void>((res, rej) => {
              server.tryShutdown((e) => {
                if (e) rej(e);
                else res();
              });
            }),
        });
      },
    );
  });
}
