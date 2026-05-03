import { config as loadRootEnv } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { loadTeknic, resolveTeknicDll, type TeknicNative } from "./teknicNative.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
loadRootEnv({ path: path.join(REPO_ROOT, ".env") });
loadRootEnv({ path: path.join(REPO_ROOT, ".env.local"), override: true });

const PROTO_ROOT = path.resolve(__dirname, "../../../proto");
const MOTOR_PROTO = path.join(PROTO_ROOT, "motor.proto");

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
const MotorCtor = v1.MotorService as grpc.ServiceClientConstructor;

type OkReply = { ok: boolean; error_message: string };

type MotorInfoWire = {
  node_index: number;
  node_type_code: number;
  node_type_label: string;
  user_id: string;
  firmware_version: string;
  serial_number: number;
  model: string;
};

type StatusReply = {
  connected: boolean;
  commanded_rpm: number;
  detail: string;
  motor?: MotorInfoWire;
};

function buildImplementation(teknic: TeknicNative): grpc.UntypedServiceImplementation {
  return {
    Connect: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<OkReply>) => {
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
    Disconnect: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<OkReply>) => {
      teknic.shutdown();
      cb(null, { ok: true, error_message: "" });
    },
    SetJogVelocity: (
      call: grpc.ServerUnaryCall<{ rpm: number }, unknown>,
      cb: grpc.sendUnaryData<OkReply>,
    ) => {
      const rpm = call.request.rpm ?? 0;
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
    Stop: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<OkReply>) => {
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
    GetStatus: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<StatusReply>) => {
      const connected = teknic.isConnected();
      let motor: MotorInfoWire | undefined;
      if (connected) {
        const raw = teknic.getMotorInfoJson();
        if (raw) {
          try {
            const o = JSON.parse(raw) as Partial<MotorInfoWire>;
            motor = {
              node_index: Number(o.node_index ?? 0),
              node_type_code: Number(o.node_type_code ?? 0),
              node_type_label: String(o.node_type_label ?? ""),
              user_id: String(o.user_id ?? ""),
              firmware_version: String(o.firmware_version ?? ""),
              serial_number: Number(o.serial_number ?? 0),
              model: String(o.model ?? ""),
            };
          } catch {
            motor = undefined;
          }
        }
      }
      cb(null, {
        connected,
        commanded_rpm: teknic.getCommandedRpm(),
        detail: teknic.getDetail() || "Teknic ClearPath",
        motor,
      });
    },
  };
}

function startGrpc(teknic: TeknicNative) {
  const server = new grpc.Server();
  server.addService(MotorCtor.service, buildImplementation(teknic));

  const port = process.env.MOTOR_GRPC_PORT ?? "50051";
  const bindAddr = `0.0.0.0:${port}`;
  server.bindAsync(
    bindAddr,
    grpc.ServerCredentials.createInsecure(),
    (err, portNum) => {
      if (err) {
        const ne = err as NodeJS.ErrnoException;
        if (ne.code === "EADDRINUSE") {
          console.error(
            `[motor-grpc] Port ${port} is already in use (another motor-grpc or leftover "npm run dev"). Stop that process or set MOTOR_GRPC_PORT.`,
          );
        }
        console.error(err);
        process.exit(1);
      }
      console.log(`motor-grpc listening on ${bindAddr} (port ${portNum})`);
    },
  );

  const shutdown = () => {
    try {
      server.forceShutdown();
    } finally {
      teknic.shutdown();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function main() {
  const dllPath = resolveTeknicDll(__dirname);
  if (!dllPath) {
    console.error(
      [
        "[motor-grpc] teknic_motor.dll not found.",
        "Build: cmake -S native/teknic_motor -B native/build -G \"Visual Studio 17 2022\" -A x64 && cmake --build native/build --config Release",
        "Or set TEKNIC_DLL to the DLL path.",
      ].join("\n"),
    );
    process.exit(1);
  }

  let teknic: TeknicNative;
  try {
    teknic = loadTeknic(dllPath);
  } catch (e) {
    console.error("[motor-grpc] Failed to load Teknic DLL:", dllPath, e);
    process.exit(1);
  }

  console.log("[motor-grpc] Teknic DLL loaded; hardware connects on Connect RPC / UI — not at startup.");
  startGrpc(teknic);
}

main();
