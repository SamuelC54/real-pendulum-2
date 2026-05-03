/**
 * gRPC **`motor.v1.MotorService`** — loads **`teknic_motor.dll`** via koffi (no C++ gRPC binary).
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { motorInfoFromTeknicJson } from "./teknic/motorInfoFromJson.js";
import { loadTeknic } from "./teknic/dll.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");
const repoProto = path.resolve(pkgRoot, "..", "..", "proto");
const PROTO_PATH = path.join(repoProto, "motor.proto");

function loadMotorServiceCtor(): grpc.ServiceClientConstructor {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [repoProto],
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as Record<
    string,
    grpc.GrpcObject | grpc.ServiceClientConstructor
  >;
  const motorNs = loaded.motor as grpc.GrpcObject;
  const v1 = motorNs.v1 as grpc.GrpcObject;
  return v1.MotorService as grpc.ServiceClientConstructor;
}

let teknic: ReturnType<typeof loadTeknic>;
try {
  teknic = loadTeknic(pkgRoot);
} catch (e) {
  console.error("[motor-grpc]", e);
  process.exit(1);
}

function impl(): grpc.UntypedServiceImplementation {
  return {
    Connect: (
      _call: grpc.ServerUnaryCall<object, { ok: boolean; error_message: string }>,
      cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>,
    ) => {
      const code = teknic.init();
      if (code !== 0) {
        cb(null, {
          ok: false,
          error_message: `teknic_init failed (${code}): ${teknic.getDetail()}`,
        });
        return;
      }
      cb(null, { ok: true, error_message: "" });
    },
    Disconnect: (
      _call: grpc.ServerUnaryCall<object, { ok: boolean; error_message: string }>,
      cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>,
    ) => {
      teknic.shutdown();
      cb(null, { ok: true, error_message: "" });
    },
    SetJogVelocity: (
      call: grpc.ServerUnaryCall<{ rpm?: number }, { ok: boolean; error_message: string }>,
      cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>,
    ) => {
      const rpm = call.request?.rpm ?? 0;
      const code = teknic.setVelocityRpm(rpm);
      if (code !== 0) {
        cb(null, {
          ok: false,
          error_message: `teknic_set_velocity_rpm failed (${code}): ${teknic.getDetail()}`,
        });
        return;
      }
      cb(null, { ok: true, error_message: "" });
    },
    Stop: (
      _call: grpc.ServerUnaryCall<object, { ok: boolean; error_message: string }>,
      cb: grpc.sendUnaryData<{ ok: boolean; error_message: string }>,
    ) => {
      const code = teknic.stop();
      if (code !== 0) {
        cb(null, {
          ok: false,
          error_message: `teknic_stop failed (${code}): ${teknic.getDetail()}`,
        });
        return;
      }
      cb(null, { ok: true, error_message: "" });
    },
    GetStatus: (
      _call: grpc.ServerUnaryCall<object, Record<string, unknown>>,
      cb: grpc.sendUnaryData<Record<string, unknown>>,
    ) => {
      const connected = teknic.isConnected();
      const detail =
        teknic.getDetail().trim() || "Teknic ClearPath";
      const reply: {
        connected: boolean;
        commanded_rpm: number;
        detail: string;
        motor?: ReturnType<typeof motorInfoFromTeknicJson>;
      } = {
        connected,
        commanded_rpm: teknic.getCommandedRpm(),
        detail,
      };
      if (connected) {
        const json = teknic.getMotorInfoJson();
        if (json) {
          const mi = motorInfoFromTeknicJson(json);
          if (mi) {
            reply.motor = mi;
          }
        }
      }
      cb(null, reply);
    },
  };
}

const MotorCtor = loadMotorServiceCtor();
const server = new grpc.Server();
server.addService(MotorCtor.service, impl());

const port = Number(process.env.MOTOR_GRPC_PORT ?? "50051");

const bindAddr = `0.0.0.0:${port}`;
server.bindAsync(
  bindAddr,
  grpc.ServerCredentials.createInsecure(),
  (err, boundPort) => {
    if (err) {
      console.error("[motor-grpc]", err);
      process.exit(1);
    }
    server.start();
    console.log(`[motor-grpc] MotorService (Node + teknic_motor.dll) listening on ${bindAddr} (port ${boundPort})`);
  },
);

function shutdown(): void {
  try {
    teknic.shutdown();
  } catch {
    /* ignore */
  }
  server.tryShutdown(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
