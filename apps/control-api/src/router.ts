import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { withGrpcBackendMode, type GrpcBackendMode } from "./grpcRequestContext.js";
import {
  getTravelLimitDisplays,
  recordTravelLimitFromTeknicMeasured,
  syncTravelLimitsFromMotorConnection,
} from "./railTravelLimits.js";
import { runLedToggleFlash } from "./runFlashScript.js";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { defaultCoupledSimGrpcUrl, resolveSimMotorGrpcUrl, resolveSimSensorGrpcUrl } from "./grpcSimDefaults.js";
import { runRailHoming, type RailHomingResult } from "./homing.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";
import {
  fetchCoupledSimConfig,
  patchCoupledSimConfig,
  type CoupledSimConfigSnapshot,
} from "./tuningSimAdmin.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MotorStatusPayload = Awaited<ReturnType<typeof motor.getMotorStatus>> & {
  travelLimits: { left: number | null; right: number | null };
};

async function readMotorStatusPayload(): Promise<MotorStatusPayload> {
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
}

type SensorStatusPayload = {
  connected: boolean;
  ledOn: boolean;
  detail: string;
  serialPort: string;
  encoderTicks: number;
  limitLeftPressed: boolean;
  limitRightPressed: boolean;
};

async function readSensorStatusPayload(): Promise<SensorStatusPayload> {
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
}

type MotorWireResult = { ok: boolean; error: string };
type SensorWireResult = { ok: boolean; error: string };

async function twinMotorWire(
  run: () => MotorWireResult | Promise<MotorWireResult>,
): Promise<MotorWireResult> {
  try {
    return await run();
  } catch (e) {
    return { ok: false, error: friendlyMotorError(e) };
  }
}

async function twinSensorWire(
  run: () => SensorWireResult | Promise<SensorWireResult>,
): Promise<SensorWireResult> {
  try {
    return await run();
  } catch (e) {
    return { ok: false, error: friendlySensorError(e) };
  }
}

type RouterContext = { grpcBackendMode?: GrpcBackendMode };

const t = initTRPC.context<RouterContext>().create({
  transformer: superjson,
});

const grpcWireMiddleware = t.middleware(async ({ ctx, next }) => {
  const mode: GrpcBackendMode = ctx.grpcBackendMode ?? "hardware";
  const motorUrl =
    mode === "sim" ? resolveSimMotorGrpcUrl() : motor.defaultMotorGrpcUrlFromEnv();
  const sensorUrl =
    mode === "sim" ? resolveSimSensorGrpcUrl() : sensor.defaultSensorGrpcUrlFromEnv();

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
    get: publicProcedure.query(async (): Promise<MotorStatusPayload> => readMotorStatusPayload()),
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
      get: publicProcedure.query(async (): Promise<SensorStatusPayload> => readSensorStatusPayload()),
    }),
  }),
  /**
   * Digital twin: same motor/sensor RPC contract against **both** hardware and simulation gRPC
   * backends. Commands hit hardware first, then mirror into sim. Reads return explicit `{ real, sim }`.
   */
  twin: t.router({
    status: t.router({
      get: baseProcedure.query(async () => ({
        real: await withHardwareGrpc(() => readMotorStatusPayload()),
        sim: await withSimGrpc(() => readMotorStatusPayload()),
      })),
    }),
    connection: t.router({
      connect: baseProcedure.mutation(async () => ({
        real: await twinMotorWire(() => withHardwareGrpc(() => motor.connectMotor())),
        sim: await twinMotorWire(() => withSimGrpc(() => motor.connectMotor())),
      })),
      disconnect: baseProcedure.mutation(async () => ({
        real: await twinMotorWire(() => withHardwareGrpc(() => motor.disconnectMotor())),
        sim: await twinMotorWire(() => withSimGrpc(() => motor.disconnectMotor())),
      })),
    }),
    jog: t.router({
      setVelocity: baseProcedure
        .input(z.object({ rpm: z.number().finite() }))
        .mutation(async ({ input }) => {
          const real = await withHardwareGrpc(async () => {
            try {
              return await motor.setJogVelocityRpm(input.rpm);
            } catch (e) {
              throw new Error(`motor: ${friendlyMotorError(e)}`);
            }
          });
          const sim = await withSimGrpc(async () => {
            try {
              return await motor.setJogVelocityRpm(input.rpm);
            } catch (e) {
              return { ok: false as const, error: friendlyMotorError(e) };
            }
          });
          return { real, sim };
        }),
      stop: baseProcedure.mutation(async () => {
        const real = await withHardwareGrpc(async () => {
          try {
            return await motor.stopMotor();
          } catch (e) {
            throw new Error(`motor: ${friendlyMotorError(e)}`);
          }
        });
        const sim = await withSimGrpc(async () => {
          try {
            return await motor.stopMotor();
          } catch (e) {
            return { ok: false as const, error: friendlyMotorError(e) };
          }
        });
        return { real, sim };
      }),
    }),
    rail: t.router({
      /** Runs full homing on hardware and simulation in parallel (independent plants). */
      home: baseProcedure.mutation(async () => {
        const [real, sim] = await Promise.all([
          withHardwareGrpc(() => runRailHoming()),
          withSimGrpc(() => runRailHoming()),
        ]);
        return { real, sim } satisfies { real: RailHomingResult; sim: RailHomingResult };
      }),
      limits: t.router({
        record: baseProcedure
          .input(z.object({ side: z.enum(["left", "right"]) }))
          .mutation(async ({ input }) => {
            await withHardwareGrpc(async () => {
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
            });
            const sim = await withSimGrpc(async () => {
              try {
                const st = await motor.getMotorStatus();
                if (!st.connected) {
                  return { ok: false as const, error: "Motor is not connected." };
                }
                const p = st.measuredPosition;
                if (p === undefined || !Number.isFinite(p)) {
                  return {
                    ok: false as const,
                    error:
                      "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
                  };
                }
                recordTravelLimitFromTeknicMeasured(p, input.side);
                return { ok: true as const };
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
              }
            });
            return { real: { ok: true as const }, sim };
          }),
      }),
      moveAbsolute: baseProcedure
        .input(
          z.object({
            displayCounts: z.number().finite(),
            maxVelocityRpm: z.number().finite().positive().optional(),
            maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const teknicCounts = -input.displayCounts;
          const opts = {
            maxVelocityRpm: input.maxVelocityRpm,
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          };
          const real = await withHardwareGrpc(async () => {
            try {
              return await motor.moveToPosition(teknicCounts, opts);
            } catch (e) {
              throw new Error(`motor: ${friendlyMotorError(e)}`);
            }
          });
          const sim = await withSimGrpc(async () => {
            try {
              return await motor.moveToPosition(teknicCounts, opts);
            } catch (e) {
              return { ok: false as const, error: friendlyMotorError(e) };
            }
          });
          return { real, sim };
        }),
    }),
    sensor: t.router({
      connection: t.router({
        connect: baseProcedure
          .input(z.object({ serialPort: z.string().optional() }))
          .mutation(async ({ input }) => ({
            real: await twinSensorWire(() =>
              withHardwareGrpc(() => sensor.connectSensor(input.serialPort)),
            ),
            sim: await twinSensorWire(() =>
              withSimGrpc(() => sensor.connectSensor(input.serialPort)),
            ),
          })),
        disconnect: baseProcedure.mutation(async () => ({
          real: await twinSensorWire(() => withHardwareGrpc(() => sensor.disconnectSensor())),
          sim: await twinSensorWire(() => withSimGrpc(() => sensor.disconnectSensor())),
        })),
      }),
      led: t.router({
        toggle: baseProcedure.mutation(async () => ({
          real: await withHardwareGrpc(async () => {
            try {
              return await sensor.toggleLed();
            } catch (e) {
              throw new Error(`sensor: ${friendlySensorError(e)}`);
            }
          }),
          sim: await withSimGrpc(async () => {
            try {
              return await sensor.toggleLed();
            } catch (e) {
              return { ok: false as const, error: friendlySensorError(e), ledOn: false };
            }
          }),
        })),
      }),
      encoder: t.router({
        reset: baseProcedure.mutation(async () => ({
          real: await withHardwareGrpc(async () => {
            try {
              return await sensor.resetEncoder();
            } catch (e) {
              throw new Error(`sensor: ${friendlySensorError(e)}`);
            }
          }),
          sim: await withSimGrpc(async () => {
            try {
              return await sensor.resetEncoder();
            } catch (e) {
              return { ok: false as const, error: friendlySensorError(e), encoderTicks: 0 };
            }
          }),
        })),
      }),
      status: t.router({
        get: baseProcedure.query(async () => ({
          real: await withHardwareGrpc(() => readSensorStatusPayload()),
          sim: await withSimGrpc(() => readSensorStatusPayload()),
        })),
      }),
    }),
  }),
  tuning: t.router({
    /** Live hardware vs simulation snapshot for the tuning UI (Twin backends). */
    compare: baseProcedure.query(async () => ({
      real: {
        motor: await withHardwareGrpc(() => readMotorStatusPayload()),
        sensor: await withHardwareGrpc(() => readSensorStatusPayload()),
      },
      sim: {
        motor: await withSimGrpc(() => readMotorStatusPayload()),
        sensor: await withSimGrpc(() => readSensorStatusPayload()),
      },
    })),
    simConfig: t.router({
      get: baseProcedure.query(() => fetchCoupledSimConfig()),
      patch: baseProcedure
        .input(
          z.object({
            metersPerDisplayCount: z.number().finite().positive().optional(),
            mpsPerRpm: z.number().finite().optional(),
            limitLeftXM: z.number().finite().optional(),
            limitRightXM: z.number().finite().optional(),
            plant: z
              .object({
                gravity: z.number().finite().positive().optional(),
                pendulumLengthM: z.number().finite().positive().optional(),
                cartVelocityTrackingPerSec: z.number().finite().positive().optional(),
                angularDampingPerSec: z.number().finite().nonnegative().optional(),
                encoderTicksPerRadian: z.number().finite().positive().optional(),
              })
              .optional(),
          }),
        )
        .mutation(async ({ input }) => patchCoupledSimConfig(input as Partial<CoupledSimConfigSnapshot>)),
    }),
  }),
});

export type AppRouter = typeof appRouter;
