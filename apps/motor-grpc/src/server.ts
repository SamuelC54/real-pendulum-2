import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

let simulatedRpm = 0;

type OkReply = { ok: boolean; error_message: string };
type StatusReply = {
  connected: boolean;
  commanded_rpm: number;
  detail: string;
};

const motorImplementation: grpc.UntypedServiceImplementation = {
  SetJogVelocity: (
    call: grpc.ServerUnaryCall<{ rpm: number }, unknown>,
    cb: grpc.sendUnaryData<OkReply>,
  ) => {
    const rpm = call.request.rpm ?? 0;
    simulatedRpm = rpm;
    cb(null, { ok: true, error_message: "" });
  },
  Stop: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<OkReply>) => {
    simulatedRpm = 0;
    cb(null, { ok: true, error_message: "" });
  },
  GetStatus: (_call: grpc.ServerUnaryCall<object, unknown>, cb: grpc.sendUnaryData<StatusReply>) => {
    cb(null, {
      connected: true,
      commanded_rpm: simulatedRpm,
      detail: "simulated motor (replace with C++ + Teknic for hardware)",
    });
  },
};

const server = new grpc.Server();
server.addService(MotorCtor.service, motorImplementation);

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
    console.log(`motor-grpc (Node sim) listening on ${bindAddr} (port ${portNum})`);
  },
);
