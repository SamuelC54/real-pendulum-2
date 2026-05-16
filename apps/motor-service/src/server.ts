/**
 * Connect **`motor.v1.MotorService`** — loads **`teknic_motor.dll`** via koffi.
 */
import * as http from "node:http";
import { create, fromJsonString } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import {
  ConnectReplySchema,
  DisconnectReplySchema,
  GetStatusReplySchema,
  MotorInfoSchema,
  MotorService,
  MoveToPositionReplySchema,
  StopReplySchema,
  SetJogVelocityReplySchema,
  ZeroMeasuredPositionReplySchema,
} from "@real-pendulum/motor-proto/gen/motor_pb.js";
import type {
  MoveToPositionRequest,
  SetJogVelocityRequest,
} from "@real-pendulum/motor-proto/gen/motor_pb.js";
import { config } from "@real-pendulum/app-config";
import { cliPort } from "@real-pendulum/app-config/cli";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
        const detail = teknic.getDetail();
        console.error("[motor-service] teknic_init failed", { code, detail });
        return create(ConnectReplySchema, {
          ok: false,
          errorMessage: `teknic_init failed (${code}): ${detail}`,
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
      const pos = connected ? teknic.getPosnMeasured() : Number.NaN;
      const reply = create(GetStatusReplySchema, {
        connected,
        commandedRpm: teknic.getCommandedRpm(),
        detail,
      });
      if (connected && Number.isFinite(pos)) {
        reply.measuredPosition = pos;
      }
      if (connected) {
        const json = teknic.getMotorInfoJson();
        if (json) {
          try {
            reply.motor = fromJsonString(MotorInfoSchema, json);
          } catch {
            /* invalid MotorInfo JSON from native */
          }
        }
      }
      return reply;
    },
    async zeroMeasuredPosition() {
      const code = teknic.zeroMeasuredPosition();
      if (code !== 0) {
        return create(ZeroMeasuredPositionReplySchema, {
          ok: false,
          errorMessage: `teknic_zero_measured_position failed (${code}): ${teknic.getDetail()}`,
        });
      }
      return create(ZeroMeasuredPositionReplySchema, {
        ok: true,
        errorMessage: "",
      });
    },
    async moveToPosition(req: MoveToPositionRequest) {
      const positionCounts = req.positionCounts ?? 0;
      const mv = req.maxVelocityRpm;
      const velLimitRpm =
        mv !== undefined && Number.isFinite(mv) && mv > 0 ? mv : Number.NaN;
      const ma = req.maxAccelerationRpmPerSec;
      const accLimitRpmPerSec =
        ma !== undefined && Number.isFinite(ma) && ma > 0 ? ma : Number.NaN;
      const code = teknic.movePosnAbsolute(
        positionCounts,
        velLimitRpm,
        accLimitRpmPerSec,
      );
      if (code !== 0) {
        return create(MoveToPositionReplySchema, {
          ok: false,
          errorMessage: `teknic_move_posn_absolute failed (${code}): ${teknic.getDetail()}`,
        });
      }
      return create(MoveToPositionReplySchema, {
        ok: true,
        errorMessage: "",
      });
    },
  });
}

const port = cliPort("--port", config.motor.grpcPort);
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
