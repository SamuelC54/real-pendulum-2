import { config } from "@real-pendulum/app-config";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { withGrpcBackendMode, type GrpcBackendMode } from "./grpcRequestContext.js";
import {
  recordTravelLimitFromTeknicMeasured,
  setTravelLimitsFromCm,
  setTravelLimitsSymmetricAboutCm,
} from "./railTravelLimits.js";
import { runLedToggleFlash } from "./runFlashScript.js";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import {
  clearMotionLatch,
  combineLimitSwitchStates,
  getMotionLatchStatus,
  updateLimitSwitchState,
} from "./motionLatch.js";
import { moveHomeWhileLatched } from "./motionLatchMoveHome.js";
import { startRecoveryJog, stopRecoveryJog } from "./motionLatchRecovery.js";
import type { MotorStatusForClient } from "./motorStatusApi.js";
import { displayCountsPerCm, teknicMeasuredToCm } from "./railPositionCm.js";
import { moveToPositionCmRespectingTravelLimits } from "./railLimitGuards.js";
import { withHardwareGrpc } from "./twinGrpc.js";
import {
  getControllerStatus,
  listControllers,
  startController,
  stopController,
} from "./controllerPhysics.js";
import { createControlClient, createTwinControlBackend } from "./control/createControlClient.js";
import { rpmToCmPerSec } from "./control/motionUnits.js";
import {
  motorStatusFromRailState,
  sensorStatusFromRailState,
} from "./control/mappers/statusMappers.js";
import { twinMotorStatus, twinSensorStatus } from "./twinControlClient.js";
import type { SensorStatusPayload } from "./statusPayload.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function symmetricTravelLimitsFromState(halfSpanCm: number, positionCm: number) {
  const limits = setTravelLimitsSymmetricAboutCm(positionCm, halfSpanCm);
  return { ok: true as const, ...limits };
}

type MotorWireResult = { ok: boolean; error: string };

type RouterContext = { grpcBackendMode?: GrpcBackendMode };

function controlModeFromCtx(ctx: RouterContext): GrpcBackendMode {
  return ctx.grpcBackendMode ?? "hardware";
}

const t = initTRPC.context<RouterContext>().create({
  transformer: superjson,
});

const grpcWireMiddleware = t.middleware(async ({ ctx, next }) => {
  const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";

  if (mode === "sim") {
    return withGrpcBackendMode("sim", () =>
      next({ ctx: { ...ctx, grpcBackendMode: mode } }),
    );
  }

  const run = () =>
    withHardwareGrpc(() => next({ ctx: { ...ctx, grpcBackendMode: mode } }));

  if (mode === "twin") {
    return withGrpcBackendMode("twin", run);
  }
  return run();
});

const baseProcedure = t.procedure;
const publicProcedure = t.procedure.use(grpcWireMiddleware);

export const appRouter = t.router({
  meta: t.router({
    backends: baseProcedure.query(() => ({
      physicsSimUrl: process.env.PHYSICS_SIM_URL ?? "http://127.0.0.1:58871",
      controllerServiceUrl: process.env.CONTROLLER_SERVICE_URL ?? "http://127.0.0.1:58872",
    })),
    rail: baseProcedure.query(() => ({
      /** Display motor counts per cm (`config.rail.displayCountsPerCm`, default 232.8). */
      displayCountsPerCm: displayCountsPerCm(),
    })),
  }),
  connection: t.router({
    connect: publicProcedure.mutation(async ({ ctx }) => {
      try {
        const r = await createControlClient(controlModeFromCtx(ctx)).connect();
        if (!r.ok) throw new Error(r.error || "Connect failed.");
        return r;
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    disconnect: publicProcedure.mutation(async ({ ctx }) => {
      try {
        await createControlClient(controlModeFromCtx(ctx)).disconnect();
        return { ok: true as const, error: "" };
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  jog: t.router({
    setVelocity: publicProcedure
      .input(
        z.object({
          rpm: z.number().finite(),
          maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createControlClient(controlModeFromCtx(ctx)).setJogCmPerSec(
            rpmToCmPerSec(input.rpm),
            { maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec },
          );
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
    stop: publicProcedure.mutation(async ({ ctx }) => {
      try {
        return await createControlClient(controlModeFromCtx(ctx)).stop();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  rail: t.router({
    limits: t.router({
      record: publicProcedure
        .input(z.object({ side: z.enum(["left", "right"]) }))
        .mutation(async ({ ctx, input }) => {
          const state = await createControlClient(controlModeFromCtx(ctx)).getState();
          if (!state.connection.cart) {
            throw new Error("Motor is not connected.");
          }
          const mode = controlModeFromCtx(ctx);
          if (mode === "sim") {
            if (state.cart.positionCm == null) {
              throw new Error("Cart position unavailable.");
            }
            setTravelLimitsFromCm({
              left: input.side === "left" ? state.cart.positionCm : state.cart.travelLimitsCm.left,
              right: input.side === "right" ? state.cart.positionCm : state.cart.travelLimitsCm.right,
            });
            return { ok: true as const };
          }
          const st = await motor.getMotorStatus();
          const p = st.measuredPosition;
          if (p === undefined || !Number.isFinite(p)) {
            throw new Error(
              "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
            );
          }
          recordTravelLimitFromTeknicMeasured(p, input.side);
          return { ok: true as const };
        }),
      setSymmetricSpan: publicProcedure
        .input(z.object({ halfSpanCm: z.number().finite().positive() }))
        .mutation(async ({ ctx, input }) => {
          const state = await createControlClient(controlModeFromCtx(ctx)).getState();
          if (state.cart.positionCm == null) {
            throw new Error("Motor position unavailable.");
          }
          return symmetricTravelLimitsFromState(input.halfSpanCm, state.cart.positionCm);
        }),
    }),
    zeroAtCurrent: publicProcedure.mutation(async ({ ctx }) => {
      const mode = controlModeFromCtx(ctx);
      if (mode === "sim") {
        return { ok: true as const };
      }
      const st = await motor.getMotorStatus();
      if (!st.connected) {
        throw new Error("Motor is not connected.");
      }
      const r = await motor.zeroMeasuredPosition();
      if (!r.ok) {
        throw new Error(r.error || "Motor zero failed.");
      }
      return { ok: true as const };
    }),
    moveAbsolute: publicProcedure
      .input(
        z.object({
          positionCm: z.number().finite(),
          maxVelocityRpm: z.number().finite().positive().optional(),
          maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const r = await moveToPositionCmRespectingTravelLimits(
            input.positionCm,
            controlModeFromCtx(ctx),
            {
              maxVelocityRpm: input.maxVelocityRpm,
              maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
            },
          );
          if (!r.ok) {
            throw new Error(r.error);
          }
          return r;
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
  }),
  status: t.router({
    get: publicProcedure.query(async ({ ctx }): Promise<MotorStatusForClient> => {
      const state = await createControlClient(controlModeFromCtx(ctx)).getState();
      return motorStatusFromRailState(state);
    }),
  }),
  sensor: t.router({
    serial: t.router({
      list: publicProcedure.query(async () => {
        try {
          return await sensor.listSerialPorts();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    connection: t.router({
      connect: publicProcedure
        .input(z.object({ serialPort: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          try {
            const mode = controlModeFromCtx(ctx);
            if (mode === "sim") {
              const r = await createControlClient("sim").connect();
              if (!r.ok) throw new Error(r.error);
              return { ok: true as const, error: "" };
            }
            return await sensor.connectSensor(input.serialPort);
          } catch (e) {
            throw new Error(`sensor: ${friendlySensorError(e)}`);
          }
        }),
      disconnect: publicProcedure.mutation(async ({ ctx }) => {
        try {
          const mode = controlModeFromCtx(ctx);
          if (mode === "sim") {
            await createControlClient("sim").disconnect();
            return { ok: true as const, error: "" };
          }
          return await sensor.disconnectSensor();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    led: t.router({
      toggle: publicProcedure.mutation(async ({ ctx }) => {
        try {
          const client = createControlClient(controlModeFromCtx(ctx));
          const state = await client.getState();
          const r = await client.setLed(!state.led.on);
          if (!r.ok) throw new Error(r.error);
          const next = await client.getState();
          return { ok: true as const, ledOn: next.led.on };
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    encoder: t.router({
      reset: publicProcedure.mutation(async () => {
        try {
          return await sensor.resetEncoder();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    firmware: t.router({
      flash: publicProcedure
        .input(z.object({ serialPort: z.string().min(1) }))
        .mutation(async ({ input }) => {
          try {
            await sensor.disconnectSensor().catch(() => {
              /* ignore if sensor service is down or already disconnected */
            });
            const pauseMs = config.controlApi.flashAfterDisconnectMs;
            if (Number.isFinite(pauseMs) && pauseMs > 0) {
              await sleep(pauseMs);
            }
            return await runLedToggleFlash(input.serialPort.trim());
          } catch (e) {
            throw new Error(
              `sensor: flash failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }),
    }),
    status: t.router({
      get: publicProcedure.query(async ({ ctx }): Promise<SensorStatusPayload> => {
        const state = await createControlClient(controlModeFromCtx(ctx)).getState();
        return sensorStatusFromRailState(state);
      }),
    }),
  }),
  /** Digital twin: hardware + physics-sim via ControlClient (no simulation gRPC). */
  twin: t.router({
    status: t.router({
      get: baseProcedure.query(() => twinMotorStatus()),
    }),
    connection: t.router({
      connect: baseProcedure.mutation(async () => {
        const twin = createTwinControlBackend();
        return twin.connectTwin();
      }),
      disconnect: baseProcedure.mutation(async () => {
        const twin = createTwinControlBackend();
        await twin.disconnectTwin();
        return { real: { ok: true as const, error: "" }, sim: { ok: true as const, error: "" } };
      }),
    }),
    jog: t.router({
      setVelocity: baseProcedure
        .input(
          z.object({
            rpm: z.number().finite(),
            maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const twin = createTwinControlBackend();
          return twin.setJogCmPerSecTwin(rpmToCmPerSec(input.rpm), {
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          });
        }),
      stop: baseProcedure.mutation(async () => createTwinControlBackend().stopTwin()),
    }),
    rail: t.router({
      limits: t.router({
        record: baseProcedure
          .input(z.object({ side: z.enum(["left", "right"]) }))
          .mutation(async ({ input }) => {
            const twin = createTwinControlBackend();
            const [realState, simState] = await Promise.all([
              twin.getPhysicalState(),
              twin.getSimulationState(),
            ]);
            if (!realState.connection.cart) {
              throw new Error("Motor is not connected.");
            }
            const rp = await motor.getMotorStatus();
            if (rp.measuredPosition !== undefined && Number.isFinite(rp.measuredPosition)) {
              recordTravelLimitFromTeknicMeasured(rp.measuredPosition, input.side);
            }
            if (simState.cart.positionCm != null) {
              setTravelLimitsFromCm({
                left:
                  input.side === "left"
                    ? simState.cart.positionCm
                    : simState.cart.travelLimitsCm.left,
                right:
                  input.side === "right"
                    ? simState.cart.positionCm
                    : simState.cart.travelLimitsCm.right,
              });
            }
            return { real: { ok: true as const }, sim: { ok: true as const } };
          }),
        setSymmetricSpan: baseProcedure
          .input(z.object({ halfSpanCm: z.number().finite().positive() }))
          .mutation(async ({ input }) => {
            const twin = createTwinControlBackend();
            const [realState, simState] = await Promise.all([
              twin.getPhysicalState(),
              twin.getSimulationState(),
            ]);
            const real =
              realState.cart.positionCm != null
                ? symmetricTravelLimitsFromState(input.halfSpanCm, realState.cart.positionCm)
                : { ok: false as const, error: "Motor position unavailable." };
            const sim =
              simState.cart.positionCm != null
                ? symmetricTravelLimitsFromState(input.halfSpanCm, simState.cart.positionCm)
                : { ok: false as const, error: "Sim position unavailable." };
            return { real, sim };
          }),
      }),
      zeroAtCurrent: baseProcedure.mutation(async () => {
        const r = await motor.zeroMeasuredPosition();
        if (!r.ok) {
          return {
            real: { ok: false as const, error: r.error || "Motor zero failed." },
            sim: { ok: true as const },
          };
        }
        return { real: { ok: true as const }, sim: { ok: true as const } };
      }),
      moveAbsolute: baseProcedure
        .input(
          z.object({
            positionCm: z.number().finite(),
            maxVelocityRpm: z.number().finite().positive().optional(),
            maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const twin = createTwinControlBackend();
          return twin.moveToPositionCmTwin(input.positionCm, {
            maxVelocityRpm: input.maxVelocityRpm,
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          });
        }),
    }),
    sensor: t.router({
      connection: t.router({
        connect: baseProcedure
          .input(z.object({ serialPort: z.string().optional() }))
          .mutation(async ({ input }) => {
            const twin = createTwinControlBackend();
            const real = await withHardwareGrpc(() => sensor.connectSensor(input.serialPort));
            const sim = await twin.simulation.connect();
            return { real, sim };
          }),
        disconnect: baseProcedure.mutation(async () => {
          const twin = createTwinControlBackend();
          const real = await withHardwareGrpc(() => sensor.disconnectSensor());
          await twin.simulation.disconnect();
          return { real, sim: { ok: true as const, error: "" } };
        }),
      }),
      led: t.router({
        toggle: baseProcedure.mutation(async () => {
          const twin = createTwinControlBackend();
          const realState = await twin.getPhysicalState();
          const simState = await twin.getSimulationState();
          const real = await twin.physical.setLed(!realState.led.on);
          const sim = await twin.simulation.setLed(!simState.led.on);
          const nextReal = await twin.getPhysicalState();
          const nextSim = await twin.getSimulationState();
          return {
            real: { ...real, ledOn: nextReal.led.on },
            sim: { ...sim, ledOn: nextSim.led.on },
          };
        }),
      }),
      encoder: t.router({
        reset: baseProcedure.mutation(async () => ({
          real: await withHardwareGrpc(() => sensor.resetEncoder()),
          sim: { ok: true as const, error: "", encoderTicks: 0 },
        })),
      }),
      status: t.router({
        get: baseProcedure.query(async () => {
          const { real, sim } = await twinSensorStatus();
          updateLimitSwitchState(combineLimitSwitchStates(real, sim));
          return { real, sim };
        }),
      }),
    }),
  }),
  /** Limit-switch latch: full motion stop until operator releases. */
  motion: t.router({
    latch: t.router({
      get: baseProcedure.query(() => getMotionLatchStatus()),
      release: baseProcedure.mutation(() => {
        clearMotionLatch();
        return getMotionLatchStatus();
      }),
      /** Hold-to-jog toward center only (bypasses latch + travel limits). */
      jogStart: baseProcedure
        .input(
          z
            .object({
              rpm: z.number().finite().positive().optional(),
              maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
            })
            .optional(),
        )
        .mutation(async ({ ctx, input }) => {
          const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";
          const result = await startRecoveryJog(mode, input ?? {});
          if (!result.ok) throw new Error(result.error);
          return result;
        }),
      jogStop: baseProcedure.mutation(async ({ ctx }) => {
        const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";
        const result = await stopRecoveryJog(mode);
        if (!result.ok) throw new Error(result.error);
        return result;
      }),
      /** Profile move to 0 cm while latched (recovery). */
      moveHome: baseProcedure
        .input(
          z
            .object({
              maxVelocityRpm: z.number().finite().positive().optional(),
              maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
            })
            .optional(),
        )
        .mutation(async ({ ctx, input }) => {
          const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";
          const result = await moveHomeWhileLatched(mode, input ?? {});
          if ("real" in result) {
            if (!result.real.ok) {
              throw new Error(result.real.error);
            }
            if (!result.sim.ok && result.sim.error) {
              throw new Error(`Sim: ${result.sim.error}`);
            }
            return result;
          }
          if (!result.ok) {
            throw new Error(result.error);
          }
          return result;
        }),
    }),
  }),
  controllers: t.router({
    list: baseProcedure.query(() => listControllers()),
    status: baseProcedure.query(() => getControllerStatus()),
    start: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          params: z.record(z.number()).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) =>
        startController(input.id, input.params ?? {}, ctx.grpcBackendMode ?? "hardware"),
      ),
    stop: publicProcedure.mutation(() => stopController()),
  }),
});

export type AppRouter = typeof appRouter;
