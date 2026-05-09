import * as http from "node:http";
import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import {
  ConnectReplySchema,
  DisconnectReplySchema,
  GetStatusReplySchema,
  MotorInfoSchema,
  MotorService,
  SetJogVelocityReplySchema,
  StopReplySchema,
  ZeroMeasuredPositionReplySchema,
} from "@real-pendulum/motor-proto/gen/motor_pb.js";
import type { ConnectReply, SetJogVelocityRequest } from "@real-pendulum/motor-proto/gen/motor_pb.js";

/** Motor info fields aligned with **`motor.v1.MotorInfo`** (camelCase). */
export type MotorInfoWire = {
  nodeIndex: number;
  nodeTypeCode: number;
  nodeTypeLabel: string;
  userId: string;
  firmwareVersion: string;
  serialNumber: bigint;
  model: string;
};

/** Mutable in-memory motor service used by the fake server (no DLL / hardware). */
export type FakeMotorGrpcModel = {
  /** Reply sent by **`connect`** (and whether **`connect`** marks **`connected`**). */
  connectReply: ConnectReply;
  connected: boolean;
  commandedRpm: number;
  /** Fake **`Motion.PosnMeasured`** counts (integration tests may mutate). */
  measuredPosition: number;
  detail: string;
  motor?: MotorInfoWire;
};

export function createFakeMotorGrpcModel(
  partial?: Partial<FakeMotorGrpcModel>,
): FakeMotorGrpcModel {
  return {
    connectReply: create(ConnectReplySchema, { ok: true, errorMessage: "" }),
    connected: false,
    commandedRpm: 0,
    measuredPosition: 0,
    detail: "fake motor service",
    ...partial,
  };
}

export type StartFakeMotorGrpcOptions = {
  /** When set, bind this port on loopback (e.g. **50051** for E2E). Omit or **0** for an ephemeral port. */
  port?: number;
};

/**
 * In-process **`MotorService`** for integration tests (same **`.proto`** as the real server).
 * Binds to **`127.0.0.1:0`** (ephemeral) unless **`options.port`** is a positive port number.
 */
export function startFakeMotorGrpcServer(
  model: FakeMotorGrpcModel,
  options?: StartFakeMotorGrpcOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const explicit = options?.port;
  const listenPort = explicit != null && explicit > 0 ? explicit : 0;
  let lastStatusMs = Date.now();

  function routes(router: ConnectRouter): void {
    router.service(MotorService, {
      async connect() {
        if (model.connectReply.ok) {
          model.connected = true;
        }
        return model.connectReply;
      },
      async disconnect() {
        model.connected = false;
        return create(DisconnectReplySchema, { ok: true, errorMessage: "" });
      },
      async setJogVelocity(req: SetJogVelocityRequest) {
        model.commandedRpm = req.rpm ?? 0;
        return create(SetJogVelocityReplySchema, { ok: true, errorMessage: "" });
      },
      async stop() {
        model.commandedRpm = 0;
        return create(StopReplySchema, { ok: true, errorMessage: "" });
      },
      async getStatus() {
        const now = Date.now();
        const dt = Math.min(1, Math.max(0, (now - lastStatusMs) / 1000));
        lastStatusMs = now;
        model.measuredPosition += ((model.commandedRpm * dt) / 60) * 800;

        const reply = create(GetStatusReplySchema, {
          connected: model.connected,
          commandedRpm: model.commandedRpm,
          detail: model.detail,
        });
        if (model.connected) {
          reply.measuredPosition = model.measuredPosition;
        }
        if (model.motor) {
          reply.motor = create(MotorInfoSchema, model.motor);
        }
        return reply;
      },
      async zeroMeasuredPosition() {
        if (!model.connected) {
          return create(ZeroMeasuredPositionReplySchema, {
            ok: false,
            errorMessage: "not connected",
          });
        }
        model.measuredPosition = 0;
        return create(ZeroMeasuredPositionReplySchema, {
          ok: true,
          errorMessage: "",
        });
      },
    });
  }

  const handler = connectNodeAdapter({ routes });

  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("fake motor: no listen address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((e) => {
              if (e) rej(e);
              else res();
            });
          }),
      });
    });
    server.on("error", reject);
  });
}
