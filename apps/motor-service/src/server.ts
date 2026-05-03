/**
 * Connect **`motor.v1.MotorService`** — loads **`teknic_motor.dll`** via koffi.
 */
import * as http from "node:http";
import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import {
  ConnectReplySchema,
  DisconnectReplySchema,
  GetStatusReplySchema,
  MotorService,
  StopReplySchema,
  SetJogVelocityReplySchema,
} from "@real-pendulum/motor-proto/gen/motor_pb.js";
import type { SetJogVelocityRequest } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { motorInfoFromTeknicJson } from "./teknic/motorInfoFromJson.js";
import { loadTeknic, type TeknicNative } from "./teknic/dll.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");

let teknic: TeknicNative;
try {
  teknic = loadTeknic(pkgRoot);
} catch (e) {
  console.error("[motor-service]", e);
  process.exit(1);
}

function routes(router: ConnectRouter): void {
  router.service(MotorService, {
    async connect() {
      const code = teknic.init();
      if (code !== 0) {
        return create(ConnectReplySchema, {
          ok: false,
          errorMessage: `teknic_init failed (${code}): ${teknic.getDetail()}`,
        });
      }
      return create(ConnectReplySchema, { ok: true, errorMessage: "" });
    },
    async disconnect() {
      teknic.shutdown();
      return create(DisconnectReplySchema, { ok: true, errorMessage: "" });
    },
    async setJogVelocity(req: SetJogVelocityRequest) {
      const rpm = req.rpm ?? 0;
      const code = teknic.setVelocityRpm(rpm);
      if (code !== 0) {
        return create(SetJogVelocityReplySchema, {
          ok: false,
          errorMessage: `teknic_set_velocity_rpm failed (${code}): ${teknic.getDetail()}`,
        });
      }
      return create(SetJogVelocityReplySchema, { ok: true, errorMessage: "" });
    },
    async stop() {
      const code = teknic.stop();
      if (code !== 0) {
        return create(StopReplySchema, {
          ok: false,
          errorMessage: `teknic_stop failed (${code}): ${teknic.getDetail()}`,
        });
      }
      return create(StopReplySchema, { ok: true, errorMessage: "" });
    },
    async getStatus() {
      const connected = teknic.isConnected();
      const detail = teknic.getDetail().trim() || "Teknic ClearPath";
      const reply = create(GetStatusReplySchema, {
        connected,
        commandedRpm: teknic.getCommandedRpm(),
        detail,
      });
      if (connected) {
        const json = teknic.getMotorInfoJson();
        if (json) {
          const mi = motorInfoFromTeknicJson(json);
          if (mi) {
            reply.motor = mi;
          }
        }
      }
      return reply;
    },
  });
}

const port = Number(process.env.MOTOR_GRPC_PORT ?? "50051");
const bindHost = "0.0.0.0";
const server = http.createServer(
  connectNodeAdapter({
    routes,
  }),
);

server.listen(port, bindHost, () => {
  console.log(
    `[motor-service] MotorService (Connect + teknic_motor.dll) http://${bindHost}:${port}`,
  );
});

function shutdown(): void {
  try {
    teknic.shutdown();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
