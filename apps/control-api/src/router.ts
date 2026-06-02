import { config, portainerIframeUrl, portainerHttpsUrl, jaegerWebUrl, jaegerDependenciesUrl } from "@real-pendulum/app-config";
import { withSpan } from "@real-pendulum/tracing";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlySensorGrpcError } from "./helpers/physical/sensorErrors.js";
import { getBackend, withControlBackend } from "./helpers/backendContext.js";
import { runLedToggleFlash } from "./helpers/physical/runFlashScript.js";
import { getControlBackend } from "./control/getControlBackend.js";
import type { ControlMode } from "./control/types.js";
import { railStateForMode } from "./control/types.js";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import {
  clearLimitSwitchMode,
  getLimitSwitchModeStatus,
  moveHomeWhileLatched,
  startRecoveryJog,
  stopRecoveryJog,
} from "./limitSwitchMode/index.js";
import { displayCountsPerCm } from "./railPositionCm.js";
import {
  getControllerStatus,
  listControllers,
  startController,
  stopController,
} from "./controllerPhysics.js";
import { pollWhileSubscribed, sleep } from "./helpers/pollSubscription.js";
import { subscribeToStateStream } from "./control/stateSubscription.js";

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

type RouterContext = { controlBackend?: ControlMode };

const t = initTRPC.context<RouterContext>().create({
  transformer: superjson,
});

const controlBackendMiddleware = t.middleware(async ({ ctx, next }) => {
  const mode = ctx.controlBackend;
  if (!mode) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing control backend mode (x-control-backend header or connectionParams)",
    });
  }
  return withControlBackend(mode, () =>
    next({ ctx: { ...ctx, controlBackend: mode } }),
  );
});

const traceMiddleware = t.middleware(({ path, type, next }) =>
  withSpan(`trpc ${type} ${path}`, async () => next(), {
    "rpc.system": "trpc",
    "rpc.method": path,
    "rpc.service": type,
  }),
);

const baseProcedure = t.procedure;
const publicProcedure = t.procedure.use(traceMiddleware).use(controlBackendMiddleware);

export const appRouter = t.router({
  meta: t.router({
    backends: baseProcedure.query(() => ({
      physicsSimUrl: process.env.PHYSICS_SIM_URL ?? "http://127.0.0.1:58871",
      controllerServiceUrl: process.env.CONTROLLER_SERVICE_URL ?? "http://127.0.0.1:58872",
      portainerUrl: portainerIframeUrl(),
      portainerOpenUrl: portainerHttpsUrl(),
      jaegerDependenciesUrl: jaegerDependenciesUrl(),
    })),
    rail: baseProcedure.query(() => ({
      displayCountsPerCm: displayCountsPerCm(),
    })),
    tracing: baseProcedure.query(() => ({
      jaegerUiUrl: jaegerWebUrl(),
    })),
  }),

  /** Thin tRPC skin over {@link ControlBackend} — one procedure per backend method where possible. */
  machine: t.router({
    state: t.router({
      get: publicProcedure.query(async () => getBackend().getState()),
      subscribe: publicProcedure.subscription(async function* ({ signal }) {
        yield* subscribeToStateStream((cb) => getBackend().subscribeToState(cb), signal);
      }),
    }),

    connect: publicProcedure.mutation(async () => {
      const r = await getBackend().connectMotor();
      if (!r.ok) throw new Error(r.error || "Connect failed.");
      return r;
    }),

    disconnect: publicProcedure.mutation(async () => {
      await getBackend().disconnectMotor();
      return { ok: true as const, error: "" };
    }),

    jog: t.router({
      set: publicProcedure
        .input(
          z.object({
            cmPerSec: z.number().finite(),
            maxAccelerationCmPerSec2: z.number().finite().positive().optional(),
          }),
        )
        .mutation(async ({ input }) =>
          getBackend().setJogCmPerSec(input.cmPerSec, {
            maxAccelerationCmPerSec2: input.maxAccelerationCmPerSec2,
          }),
        ),
      stop: publicProcedure.mutation(async () => getBackend().stop()),
    }),

    move: t.router({
      toPosition: publicProcedure
        .input(
          z.object({
            positionCm: z.number().finite(),
            maxVelocityCmPerSec: z.number().finite().positive().optional(),
            maxAccelerationCmPerSec2: z.number().finite().positive().optional(),
            recovery: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const { positionCm, recovery, ...opts } = input;
          const r = await getBackend().moveToPositionCm(positionCm, { ...opts, recovery });
          if (!r.ok) throw new Error(r.error);
          return r;
        }),
    }),

    travelLimits: t.router({
      set: publicProcedure
        .input(
          z.object({
            left: z.number().nullable(),
            right: z.number().nullable(),
          }),
        )
        .mutation(async ({ input }) => getBackend().setTravelLimits(input)),

      recordSide: publicProcedure
        .input(z.object({ side: z.enum(["left", "right"]) }))
        .mutation(async ({ input }) => {
          const r = await getBackend().recordTravelLimitSide(input.side);
          if (!r.ok) throw new Error(r.error);
          return r;
        }),

      setSymmetricSpan: publicProcedure
        .input(z.object({ halfSpanCm: z.number().finite().positive() }))
        .mutation(async ({ input }) => {
          const r = await getBackend().setSymmetricTravelSpan(input.halfSpanCm);
          if (!r.ok) throw new Error(r.error);
          return r;
        }),
    }),

    led: t.router({
      set: publicProcedure
        .input(z.object({ on: z.boolean() }))
        .mutation(async ({ input }) => {
          const backend = getBackend();
          const r = await backend.setLed(input.on);
          if (!r.ok) throw new Error(r.error);
          const next = railStateForMode(await backend.getState(), backend.mode);
          return { ok: true as const, ledOn: next.led.on };
        }),
    }),

    /** Redefine cart position so the current location reads as 0 cm. */
    zeroAtCurrent: publicProcedure.mutation(async () => {
      const r = await getBackend().zeroCartAtCurrent();
      if (!r.ok) throw new Error(r.error || "Zero at current failed.");
      return { ok: true as const };
    }),
  }),

  /** Sensor board admin — outside ControlBackend (USB, firmware, encoder reset). */
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
          const r = await getBackend().connectSensor(input.serialPort);
          if (!r.ok) throw new Error(`sensor: ${r.error}`);
          return r;
        }),
      disconnect: publicProcedure.mutation(async () => {
        const r = await getBackend().disconnectSensor();
        if (!r.ok) throw new Error(`sensor: ${r.error}`);
        return r;
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
            try {
              await getControlBackend("physical").disconnectSensor();
            } catch {
              /* ignore if sensor service is down or already disconnected */
            }
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
  }),

  limitSwitchMode: t.router({
    get: baseProcedure.query(() => getLimitSwitchModeStatus()),
    subscribe: baseProcedure.subscription(async function* ({ signal }) {
      yield* pollWhileSubscribed(
        () => getLimitSwitchModeStatus(),
        signal,
        () => 150,
      );
    }),
    release: baseProcedure.mutation(() => {
      clearLimitSwitchMode();
      return getLimitSwitchModeStatus();
    }),
    jogStart: publicProcedure
      .input(
        z
          .object({
            cmPerSec: z.number().finite().positive().optional(),
            maxAccelerationCmPerSec2: z.number().finite().positive().optional(),
          })
          .optional(),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await startRecoveryJog(ctx.controlBackend, input ?? {});
        if (!result.ok) throw new Error(result.error);
        return result;
      }),
    jogStop: publicProcedure.mutation(async ({ ctx }) => {
      const result = await stopRecoveryJog(ctx.controlBackend);
      if (!result.ok) throw new Error(result.error);
      return result;
    }),
    moveHome: publicProcedure
      .input(
        z
          .object({
            maxVelocityCmPerSec: z.number().finite().positive().optional(),
            maxAccelerationCmPerSec2: z.number().finite().positive().optional(),
          })
          .optional(),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await moveHomeWhileLatched(ctx.controlBackend, input ?? {});
        if ("real" in result) {
          if (!result.real.ok) throw new Error(result.real.error);
          if (!result.sim.ok && result.sim.error) {
            throw new Error(`Sim: ${result.sim.error}`);
          }
          return result;
        }
        if (!result.ok) throw new Error(result.error);
        return result;
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
      .mutation(async ({ input }) =>
        startController(input.id, input.params ?? {}, getBackend()),
      ),
    stop: publicProcedure.mutation(() => stopController()),
  }),
});

export type AppRouter = typeof appRouter;
