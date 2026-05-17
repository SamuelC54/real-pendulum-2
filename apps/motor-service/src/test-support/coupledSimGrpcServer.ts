/**
 * Combined **`motor.v1.MotorService`** + **`sensor.v1.SensorService`** on one HTTP port, sharing one
 * cart–pendulum plant (MuJoCo via `apps/physics-sim`).
 */
import * as http from "node:http";
import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import {
  applyPhysicsPayloadToPlant,
  createCartPendulumPlant,
  encoderTicksInt,
  physicsSimHealthCheck,
  physicsSimPatchConfig,
  physicsSimReset,
  physicsSimStep,
  type CartPendulumPlant,
} from "@real-pendulum/physics-sim/client";
import {
  ConnectReplySchema,
  DisconnectReplySchema,
  GetStatusReplySchema,
  MotorInfoSchema,
  MotorService,
  MoveToPositionReplySchema,
  SetJogVelocityReplySchema,
  StopReplySchema,
  ZeroMeasuredPositionReplySchema,
} from "@real-pendulum/motor-proto/gen/motor_pb.js";
import type { MoveToPositionRequest, SetJogVelocityRequest } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import {
  ConnectReplySchema as SensorConnectReplySchema,
  DisconnectReplySchema as SensorDisconnectReplySchema,
  GetStatusReplySchema as SensorGetStatusReplySchema,
  ListSerialPortsReplySchema,
  ResetEncoderReplySchema,
  SensorService,
  SerialPortInfoSchema,
  ToggleLedReplySchema,
} from "@real-pendulum/motor-proto/gen/sensor_pb.js";
import {
  loadCoupledSimParametersForStartup,
  type CoupledSimParameters,
} from "@real-pendulum/app-config/coupled-sim-parameters";
import { encoderTicksPerRadian, plantGravityMS2 } from "@real-pendulum/app-config/pendulum";
import { metersPerDisplayCount } from "@real-pendulum/app-config/rail";
import { simLimitLeftXM, simLimitRightXM } from "@real-pendulum/app-config/sim-limits";

export type CoupledSimGrpcOptions = {
  port?: number;
  /** `vCmdMps = -rpm * mpsPerRpm` when jogging (matches Teknic/display: +rpm → display counts decrease). */
  mpsPerRpm: number;
  /** Cart position (m) at or below which the left limit switch is pressed. */
  limitLeftXM: number;
  /** Cart position (m) at or above which the right limit switch is pressed. */
  limitRightXM: number;
};

export type CoupledSimGrpcModel = {
  plant: CartPendulumPlant;
  motorConnected: boolean;
  sensorConnected: boolean;
  ledOn: boolean;
  /** Last jog RPM from `SetJogVelocity` (echoed in motor `GetStatus`). */
  lastCommandedRpm: number;
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  detail: string;
};

export type CoupledSimConfigSnapshot = {
  metersPerDisplayCount: number;
  mpsPerRpm: number;
  limitLeftXM: number;
  limitRightXM: number;
  plant: {
    gravity: number;
    pendulumLengthM: number;
    cartVelocityTrackingPerSec: number;
    angularDampingPerSec: number;
    encoderTicksPerRadian: number;
  };
};

export function getCoupledSimConfigSnapshot(model: CoupledSimGrpcModel): CoupledSimConfigSnapshot {
  const c = model.plant.config;
  return {
    metersPerDisplayCount: metersPerDisplayCount(),
    mpsPerRpm: model.mpsPerRpm,
    limitLeftXM: simLimitLeftXM(),
    limitRightXM: simLimitRightXM(),
    plant: {
      gravity: plantGravityMS2(),
      pendulumLengthM: c.pendulumLengthM,
      cartVelocityTrackingPerSec: c.cartVelocityTrackingPerSec,
      angularDampingPerSec: c.angularDampingPerSec,
      encoderTicksPerRadian: encoderTicksPerRadian(),
    },
  };
}

export async function patchCoupledSimConfig(
  model: CoupledSimGrpcModel,
  patch: Partial<CoupledSimConfigSnapshot> & { plant?: Partial<CoupledSimConfigSnapshot["plant"]> },
): Promise<void> {
  if (patch.mpsPerRpm != null && Number.isFinite(patch.mpsPerRpm)) {
    model.mpsPerRpm = patch.mpsPerRpm;
  }
  const plantPatch: Partial<CoupledSimConfigSnapshot["plant"]> = {};
  if (patch.plant) {
    const cfg = model.plant.config as CartPendulumPlant["config"] & Record<string, number>;
    if (patch.plant.gravity != null && Number.isFinite(patch.plant.gravity)) {
      cfg.gravity = patch.plant.gravity;
      plantPatch.gravity = patch.plant.gravity;
    }
    if (patch.plant.pendulumLengthM != null && Number.isFinite(patch.plant.pendulumLengthM)) {
      cfg.pendulumLengthM = patch.plant.pendulumLengthM;
      plantPatch.pendulumLengthM = patch.plant.pendulumLengthM;
    }
    if (
      patch.plant.cartVelocityTrackingPerSec != null &&
      Number.isFinite(patch.plant.cartVelocityTrackingPerSec)
    ) {
      cfg.cartVelocityTrackingPerSec = patch.plant.cartVelocityTrackingPerSec;
      plantPatch.cartVelocityTrackingPerSec = patch.plant.cartVelocityTrackingPerSec;
    }
    if (patch.plant.angularDampingPerSec != null && Number.isFinite(patch.plant.angularDampingPerSec)) {
      cfg.angularDampingPerSec = patch.plant.angularDampingPerSec;
      plantPatch.angularDampingPerSec = patch.plant.angularDampingPerSec;
    }
  }
  if (Object.keys(plantPatch).length > 0) {
    const payload = await physicsSimPatchConfig(plantPatch);
    applyPhysicsPayloadToPlant(model.plant, payload);
  }
}

function handleAdminConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  model: CoupledSimGrpcModel,
): void {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(getCoupledSimConfigSnapshot(model)));
    return;
  }
  if (req.method === "PATCH") {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          const patch = raw ? (JSON.parse(raw) as Partial<CoupledSimConfigSnapshot>) : {};
          await patchCoupledSimConfig(model, patch);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(getCoupledSimConfigSnapshot(model)));
        } catch (e) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end(e instanceof Error ? e.message : String(e));
        }
      })();
    });
    return;
  }
  res.writeHead(405, { "content-type": "text/plain" });
  res.end("GET or PATCH only");
}

function plantFromParameters(file: CoupledSimParameters): CartPendulumPlant {
  return createCartPendulumPlant(
    {
      gravity: plantGravityMS2(),
      pendulumLengthM: file.pendulumLengthM,
      cartVelocityTrackingPerSec: file.cartVelocityTrackingPerSec,
      angularDampingPerSec: file.angularDampingPerSec,
      encoderTicksPerRadian: encoderTicksPerRadian(),
    },
    {
      xM: 0,
      vMps: 0,
      thetaRad: 0.05,
      omegaRps: 0,
      vCmdMps: 0,
    },
  );
}

export async function createCoupledSimGrpcModel(
  partial?: Partial<CoupledSimGrpcOptions> & { plant?: CartPendulumPlant },
): Promise<CoupledSimGrpcModel> {
  const file = loadCoupledSimParametersForStartup();
  const mpsPerRpm = partial?.mpsPerRpm ?? file.mpsPerRpm;
  const limitLeftXM = partial?.limitLeftXM ?? simLimitLeftXM();
  const limitRightXM = partial?.limitRightXM ?? simLimitRightXM();
  const plant = partial?.plant ?? plantFromParameters(file);
  const model: CoupledSimGrpcModel = {
    plant,
    motorConnected: false,
    sensorConnected: false,
    ledOn: false,
    lastCommandedRpm: 0,
    mpsPerRpm,
    limitLeftXM,
    limitRightXM,
    detail: "SIM: coupled cart + pendulum (MuJoCo physics-sim)",
  };

  const ok = await physicsSimHealthCheck();
  if (!ok) {
    throw new Error(
      "physics-sim is not reachable. Start it with: npm run dev -w @real-pendulum/physics-sim",
    );
  }
  const payload = await physicsSimReset({
    config: { ...plant.config },
    initial: { ...plant.state },
  });
  applyPhysicsPayloadToPlant(plant, payload);

  return model;
}

/** Teknic `PosnMeasured` counts: UI display = `-measuredPosition` → `measured = -display = -xM / metersPerDisplay`. */
function teknicMeasuredFromPlant(model: CoupledSimGrpcModel): number {
  const x = model.plant.state.xM;
  return -x / metersPerDisplayCount();
}

/** Stop velocity commands that would drive further into an active limit switch. */
function enforceTravelLimitOnPlant(model: CoupledSimGrpcModel): void {
  if (!model.sensorConnected) return;
  const x = model.plant.state.xM;
  const atLeft = x <= model.limitLeftXM;
  const atRight = x >= model.limitRightXM;
  // Jog left (+rpm) → vCmdMps < 0; jog right → vCmdMps > 0 (see setJogVelocity).
  if (atLeft && model.plant.state.vCmdMps < 0) {
    model.plant.state.vCmdMps = 0;
    model.lastCommandedRpm = 0;
  }
  if (atRight && model.plant.state.vCmdMps > 0) {
    model.plant.state.vCmdMps = 0;
    model.lastCommandedRpm = 0;
  }
}

async function syncPlantToPhysics(model: CoupledSimGrpcModel): Promise<void> {
  const payload = await physicsSimReset({
    config: { ...model.plant.config },
    initial: { ...model.plant.state },
  });
  applyPhysicsPayloadToPlant(model.plant, payload);
}

async function advancePhysics(model: CoupledSimGrpcModel, lastMs: { t: number }): Promise<void> {
  if (!model.motorConnected) return;
  const now = Date.now();
  const dt = Math.min(0.25, Math.max(0, (now - lastMs.t) / 1000));
  lastMs.t = now;
  if (dt <= 0) return;
  const payload = await physicsSimStep({
    dt,
    vCmdMps: model.plant.state.vCmdMps,
  });
  applyPhysicsPayloadToPlant(model.plant, payload);
  enforceTravelLimitOnPlant(model);
}

export function startCoupledSimGrpcServer(
  model: CoupledSimGrpcModel,
  options?: { port?: number },
): Promise<{ url: string; close: () => Promise<void> }> {
  const explicit = options?.port;
  const listenPort = explicit != null && explicit > 0 ? explicit : 0;
  const lastMs = { t: Date.now() };

  function routes(router: ConnectRouter): void {
    router.service(MotorService, {
      async connect() {
        model.motorConnected = true;
        return create(ConnectReplySchema, { ok: true, errorMessage: "" });
      },
      async disconnect() {
        model.motorConnected = false;
        model.plant.state.vCmdMps = 0;
        model.lastCommandedRpm = 0;
        return create(DisconnectReplySchema, { ok: true, errorMessage: "" });
      },
      async setJogVelocity(req: SetJogVelocityRequest) {
        if (!model.motorConnected) {
          return create(SetJogVelocityReplySchema, {
            ok: false,
            errorMessage: "not connected",
          });
        }
        const rpm = req.rpm ?? 0;
        model.lastCommandedRpm = rpm;
        model.plant.state.vCmdMps = -rpm * model.mpsPerRpm;
        enforceTravelLimitOnPlant(model);
        return create(SetJogVelocityReplySchema, { ok: true, errorMessage: "" });
      },
      async stop() {
        if (!model.motorConnected) {
          return create(StopReplySchema, { ok: false, errorMessage: "not connected" });
        }
        model.plant.state.vCmdMps = 0;
        model.plant.state.vMps = 0;
        model.lastCommandedRpm = 0;
        return create(StopReplySchema, { ok: true, errorMessage: "" });
      },
      async getStatus() {
        await advancePhysics(model, lastMs);
        const reply = create(GetStatusReplySchema, {
          connected: model.motorConnected,
          commandedRpm: model.lastCommandedRpm,
          detail: model.detail,
        });
        if (model.motorConnected) {
          reply.measuredPosition = teknicMeasuredFromPlant(model);
          reply.motor = create(MotorInfoSchema, {
            nodeIndex: 0,
            nodeTypeCode: 0,
            nodeTypeLabel: "CoupledSim",
            userId: "sim",
            firmwareVersion: "0",
            serialNumber: BigInt(0),
            model: "mujoco-cart-pendulum",
          });
        }
        return reply;
      },
      async zeroMeasuredPosition() {
        if (!model.motorConnected) {
          return create(ZeroMeasuredPositionReplySchema, {
            ok: false,
            errorMessage: "not connected",
          });
        }
        model.plant.state.xM = 0;
        model.plant.state.vMps = 0;
        await syncPlantToPhysics(model);
        return create(ZeroMeasuredPositionReplySchema, { ok: true, errorMessage: "" });
      },
      async moveToPosition(req: MoveToPositionRequest) {
        if (!model.motorConnected) {
          return create(MoveToPositionReplySchema, {
            ok: false,
            errorMessage: "not connected",
          });
        }
        model.plant.state.vCmdMps = 0;
        model.lastCommandedRpm = 0;
        const teknic = req.positionCounts ?? 0;
        const display = -teknic;
        model.plant.state.xM = display * metersPerDisplayCount();
        model.plant.state.vMps = 0;
        lastMs.t = Date.now();
        await syncPlantToPhysics(model);
        return create(MoveToPositionReplySchema, { ok: true, errorMessage: "" });
      },
    });

    router.service(SensorService, {
      async connect() {
        model.sensorConnected = true;
        return create(SensorConnectReplySchema, { ok: true, errorMessage: "" });
      },
      async disconnect() {
        model.sensorConnected = false;
        return create(SensorDisconnectReplySchema, { ok: true, errorMessage: "" });
      },
      async toggleLed() {
        model.ledOn = !model.ledOn;
        return create(ToggleLedReplySchema, {
          ok: true,
          errorMessage: "",
          ledOn: model.ledOn,
        });
      },
      async getStatus() {
        await advancePhysics(model, lastMs);
        const x = model.plant.state.xM;
        const left = model.sensorConnected && x <= model.limitLeftXM;
        const right = model.sensorConnected && x >= model.limitRightXM;
        const ticks = encoderTicksInt(model.plant);
        const clamped = Math.max(-2_147_483_648, Math.min(2_147_483_647, ticks));
        return create(SensorGetStatusReplySchema, {
          connected: model.sensorConnected,
          ledOn: model.ledOn,
          detail: model.sensorConnected ? "SIM coupled sensor" : "SIM sensor disconnected",
          serialPort: model.sensorConnected ? "SIM" : "",
          encoderTicks: clamped,
          limitLeftPressed: left,
          limitRightPressed: right,
        });
      },
      async listSerialPorts() {
        return create(ListSerialPortsReplySchema, {
          ports: [
            create(SerialPortInfoSchema, {
              path: "SIM",
              manufacturer: "real-pendulum",
              serialNumber: "coupled-sim",
              friendlyName: "Coupled plant (no USB)",
            }),
          ],
        });
      },
      async resetEncoder() {
        model.plant.state.encoderTicksFloat = 0;
        model.plant.state.thetaRad = 0;
        model.plant.state.omegaRps = 0;
        await syncPlantToPhysics(model);
        return create(ResetEncoderReplySchema, {
          ok: true,
          errorMessage: "",
          encoderTicks: encoderTicksInt(model.plant),
        });
      },
    });
  }

  const handler = connectNodeAdapter({ routes });

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const path = req.url?.split("?")[0] ?? "";
      if (path === "/admin/config") {
        handleAdminConfig(req, res, model);
        return;
      }
      void handler(req, res);
    });
    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("coupled sim: no listen address"));
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
