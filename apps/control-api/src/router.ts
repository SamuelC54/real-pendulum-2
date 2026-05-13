import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { withGrpcBackendMode, type GrpcBackendMode } from "./grpcRequestContext.js";
import { runRailHoming } from "./homing.js";
import {
  getTravelLimitDisplays,
  recordTravelLimitFromTeknicMeasured,
  syncTravelLimitsFromMotorConnection,
} from "./railTravelLimits.js";
import { runLedToggleFlash } from "./runFlashScript.js";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { defaultCoupledSimGrpcUrl, resolveSimMotorGrpcUrl, resolveSimSensorGrpcUrl } from "./grpcSimDefaults.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RouterContext = { grpcBackendMode?: GrpcBackendMode };

const t = initTRPC.context<RouterContext>().create({
  transformer: superjson,
});

const grpcWireMiddleware = t.middleware(async ({ ctx, next }) => {
  const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";
  const motorUrl = mode === "sim" ? resolveSimMotorGrpcUrl() : motor.defaultMotorGrpcUrlFromEnv();
  const sensorUrl = mode === "sim" ? resolveSimSensorGrpcUrl() : sensor.defaultSensorGrpcUrlFromEnv();

  const run = () =>
    motor.withMotorGrpcBaseUrl(motorUrl, () =>
      sensor.withSensorGrpcBaseUrl(sensorUrl, () =>
        next({ ctx: { ...ctx, grpcBackendMode: mode } }),
      ),
    );

  if (mode === "sim") {
    return withGrpcBackendMode("sim", run);
  }
  return run();
});

const baseProcedure = t.procedure;
const publicProcedure = t.procedure.use(grpcWireMiddleware);

export const appRouter = t.router({
  meta: t.router({
    backends: baseProcedure.query(() => ({
      /** Used when **`MOTOR_SIM_GRPC_URL`** / **`SENSOR_SIM_GRPC_URL`** are unset (coupled sim). */
      simDefaultUrl: defaultCoupledSimGrpcUrl(),
    })),
  }),
  connection: t.router({
    connect: publicProcedure.mutation(async () => {
      try {
        return await motor.connectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    disconnect: publicProcedure.mutation(async () => {
      try {
        return await motor.disconnectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  jog: t.router({
    setVelocity: publicProcedure
      .input(z.object({ rpm: z.number().finite() }))
      .mutation(async ({ input }) => {
        try {
          return await motor.setJogVelocityRpm(input.rpm);
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
    stop: publicProcedure.mutation(async () => {
      try {
        return await motor.stopMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  rail: t.router({
    home: publicProcedure.mutation(async () => {
      try {
        return await runRailHoming();
      } catch (e) {
        throw new Error(
          `rail: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }),
    /**
     * Record which side is at the current measured position (call on limit-switch rising edge).
     * Server snapshots motor `PosnMeasured` so the value matches status strip / homing.
     */
    limits: t.router({
      record: publicProcedure
        .input(z.object({ side: z.enum(["left", "right"]) }))
        .mutation(async ({ input }) => {
          const st = await motor.getMotorStatus();
          if (!st.connected) {
            throw new Error("Motor is not connected.");
          }
          const p = st.measuredPosition;
          if (p === undefined || !Number.isFinite(p)) {
            throw new Error(
              "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
            );
          }
          recordTravelLimitFromTeknicMeasured(p, input.side);
          return { ok: true as const };
        }),
    }),
    /** Teknic `MovePosnStart` absolute move — target is UI display counts (negated to Teknic counts). */
    moveAbsolute: publicProcedure
      .input(
        z.object({
          displayCounts: z.number().finite(),
          /** Caps profile peak RPM (`Motion.VelLimit`). Omit to use motor-service default. */
          maxVelocityRpm: z.number().finite().positive().optional(),
          /** Caps profile acceleration (`Motion.AccLimit`, RPM/s when AccUnit is RPM_PER_SEC). Omit to use motor-service default. */
          maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const teknicCounts = -input.displayCounts;
          return await motor.moveToPosition(teknicCounts, {
            maxVelocityRpm: input.maxVelocityRpm,
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          });
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
  }),
  status: t.router({
    get: publicProcedure.query(async () => {
      try {
        const st = await motor.getMotorStatus();
        syncTravelLimitsFromMotorConnection(st.connected);
        return {
          ...st,
          travelLimits: getTravelLimitDisplays(),
        };
      } catch (e) {
        syncTravelLimitsFromMotorConnection(false);
        return {
          connected: false,
          commandedRpm: 0,
          detail: friendlyMotorError(e),
          measuredPosition: undefined,
          travelLimits: { left: null, right: null },
        };
      }
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
        .mutation(async ({ input }) => {
          try {
            return await sensor.connectSensor(input.serialPort);
          } catch (e) {
            throw new Error(`sensor: ${friendlySensorError(e)}`);
          }
        }),
      disconnect: publicProcedure.mutation(async () => {
        try {
          return await sensor.disconnectSensor();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    led: t.router({
      toggle: publicProcedure.mutation(async () => {
        try {
          return await sensor.toggleLed();
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
            const pauseMs = Number(process.env.FLASH_AFTER_DISCONNECT_MS ?? "2000");
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
      get: publicProcedure.query(async () => {
        try {
          return await sensor.getSensorStatus();
        } catch (e) {
          return {
            connected: false,
            ledOn: false,
            detail: friendlySensorError(e),
            serialPort: "",
            encoderTicks: 0,
            limitLeftPressed: false,
            limitRightPressed: false,
          };
        }
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
