/**
 * gRPC **`motor.v1.MotorService`** — loads **`teknic_motor.dll`** via koffi (no C++ gRPC binary).
 */
import * as grpc from "@grpc/grpc-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMotorServiceCtor } from "./loadMotorService.js";
import { motorInfoFromTeknicJson } from "./teknic/motorInfoFromJson.js";
import { loadTeknic, type TeknicNative } from "./teknic/dll.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");

type SimpleResult = { ok: boolean; error_message: string };

let teknic: TeknicNative;
try {
  teknic = loadTeknic(pkgRoot);
} catch (e) {
  console.error("[motor-service]", e);
  process.exit(1);
}

function sendOk(cb: grpc.sendUnaryData<SimpleResult>): void {
  cb(null, { ok: true, error_message: "" });
}

function sendFail(
  cb: grpc.sendUnaryData<SimpleResult>,
  label: string,
  code: number,
): void {
  cb(null, {
    ok: false,
    error_message: `${label} failed (${code}): ${teknic.getDetail()}`,
  });
}

function impl(): grpc.UntypedServiceImplementation {
  return {
    Connect: (
      _call: grpc.ServerUnaryCall<object, SimpleResult>,
      cb: grpc.sendUnaryData<SimpleResult>,
    ) => {
      const code = teknic.init();
      if (code !== 0) {
        sendFail(cb, "teknic_init", code);
        return;
      }
      sendOk(cb);
    },
    Disconnect: (
      _call: grpc.ServerUnaryCall<object, SimpleResult>,
      cb: grpc.sendUnaryData<SimpleResult>,
    ) => {
      teknic.shutdown();
      sendOk(cb);
    },
    SetJogVelocity: (
      call: grpc.ServerUnaryCall<{ rpm?: number }, SimpleResult>,
      cb: grpc.sendUnaryData<SimpleResult>,
    ) => {
      const rpm = call.request?.rpm ?? 0;
      const code = teknic.setVelocityRpm(rpm);
      if (code !== 0) {
        sendFail(cb, "teknic_set_velocity_rpm", code);
        return;
      }
      sendOk(cb);
    },
    Stop: (
      _call: grpc.ServerUnaryCall<object, SimpleResult>,
      cb: grpc.sendUnaryData<SimpleResult>,
    ) => {
      const code = teknic.stop();
      if (code !== 0) {
        sendFail(cb, "teknic_stop", code);
        return;
      }
      sendOk(cb);
    },
    GetStatus: (
      _call: grpc.ServerUnaryCall<object, Record<string, unknown>>,
      cb: grpc.sendUnaryData<Record<string, unknown>>,
    ) => {
      const connected = teknic.isConnected();
      const detail = teknic.getDetail().trim() || "Teknic ClearPath";
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

const MotorCtor = loadMotorServiceCtor(pkgRoot);
const server = new grpc.Server();
server.addService(MotorCtor.service, impl());

const port = Number(process.env.MOTOR_GRPC_PORT ?? "50051");
const bindAddr = `0.0.0.0:${port}`;
server.bindAsync(
  bindAddr,
  grpc.ServerCredentials.createInsecure(),
  (err, boundPort) => {
    if (err) {
      console.error("[motor-service]", err);
      process.exit(1);
    }
    server.start();
    console.log(
      `[motor-service] MotorService (Node + teknic_motor.dll) listening on ${bindAddr} (port ${boundPort})`,
    );
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
