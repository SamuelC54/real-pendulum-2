import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { runRailHoming } from "./homing.js";
import {
  getRailDisplayBounds,
  resetRailDisplayBounds,
  syncRailDisplayBoundsFromMotorStatus,
} from "./railDisplayBounds.js";
import { runLedToggleFlash } from "./runFlashScript.js";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const t = initTRPC.context<{ motorUnavailable?: boolean }>().create({
  transformer: superjson,
});

export const appRouter = t.router({
  connection: t.router({
    connect: t.procedure.mutation(async () => {
      try {
        return await motor.connectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    disconnect: t.procedure.mutation(async () => {
      try {
        return await motor.disconnectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  jog: t.router({
    setVelocity: t.procedure
      .input(z.object({ rpm: z.number().finite() }))
      .mutation(async ({ input }) => {
        try {
          return await motor.setJogVelocityRpm(input.rpm);
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
    stop: t.procedure.mutation(async () => {
      try {
        return await motor.stopMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  rail: t.router({
    home: t.procedure.mutation(async () => {
      try {
        return await runRailHoming();
      } catch (e) {
        throw new Error(
          `rail: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }),
    bounds: t.router({
      reset: t.procedure
        .input(z.object({ displayCounts: z.number().finite() }))
        .mutation(({ input }) => {
          resetRailDisplayBounds(input.displayCounts);
          return { ok: true as const };
        }),
    }),
    /** Teknic `MovePosnStart` absolute move — target is UI display counts (negated to Teknic counts). */
    moveAbsolute: t.procedure
      .input(z.object({ displayCounts: z.number().finite() }))
      .mutation(async ({ input }) => {
        try {
          const teknicCounts = -input.displayCounts;
          return await motor.moveToPosition(teknicCounts);
        } catch (e) {
          throw new Error(`motor: ${friendlyMotorError(e)}`);
        }
      }),
  }),
  status: t.router({
    get: t.procedure.query(async () => {
      try {
        const st = await motor.getMotorStatus();
        syncRailDisplayBoundsFromMotorStatus(st.connected, st.measuredPosition);
        return {
          ...st,
          railDisplayBounds: getRailDisplayBounds(),
        };
      } catch (e) {
        syncRailDisplayBoundsFromMotorStatus(false, undefined);
        return {
          connected: false,
          commandedRpm: 0,
          detail: friendlyMotorError(e),
          measuredPosition: undefined,
          railDisplayBounds: null,
        };
      }
    }),
  }),
  sensor: t.router({
    serial: t.router({
      list: t.procedure.query(async () => {
        try {
          return await sensor.listSerialPorts();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    connection: t.router({
      connect: t.procedure
        .input(z.object({ serialPort: z.string().optional() }))
        .mutation(async ({ input }) => {
          try {
            return await sensor.connectSensor(input.serialPort);
          } catch (e) {
            throw new Error(`sensor: ${friendlySensorError(e)}`);
          }
        }),
      disconnect: t.procedure.mutation(async () => {
        try {
          return await sensor.disconnectSensor();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    led: t.router({
      toggle: t.procedure.mutation(async () => {
        try {
          return await sensor.toggleLed();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    encoder: t.router({
      reset: t.procedure.mutation(async () => {
        try {
          return await sensor.resetEncoder();
        } catch (e) {
          throw new Error(`sensor: ${friendlySensorError(e)}`);
        }
      }),
    }),
    firmware: t.router({
      flash: t.procedure
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
      get: t.procedure.query(async () => {
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
