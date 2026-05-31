import { config } from "@real-pendulum/app-config";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import { friendlySensorGrpcError } from "./sensorErrors.js";
import { withGrpcBackendMode, type GrpcBackendMode } from "./grpcRequestContext.js";
import {
  recordTravelLimitFromTeknicMeasured,
  setTravelLimitsSymmetricAboutCm,
} from "./railTravelLimits.js";
import { runLedToggleFlash } from "./runFlashScript.js";
import * as motor from "@real-pendulum/motor-service/sdk";
import * as sensor from "@real-pendulum/sensor-service/sdk";
import { defaultSimulationGrpcUrl, resolveSimMotorGrpcUrl, resolveSimSensorGrpcUrl } from "./grpcSimDefaults.js";
import { runRailHoming } from "./homing.js";
import {
  clearMotionLatch,
  combineLimitSwitchStates,
  getMotionLatchStatus,
  runWithHomingBypass,
  updateLimitSwitchState,
} from "./motionLatch.js";
import { moveHomeWhileLatched } from "./motionLatchMoveHome.js";
import { startRecoveryJog, stopRecoveryJog } from "./motionLatchRecovery.js";
import { homingResultForClient } from "./homingApi.js";
import type { MotorStatusForClient } from "./motorStatusApi.js";
import { readMotorStatusPayload, readSensorStatusPayload, type SensorStatusPayload } from "./statusPayload.js";
import { displayCountsPerCm, teknicMeasuredToCm } from "./railPositionCm.js";
import {
  moveToPositionCmRespectingTravelLimits,
  setJogVelocityRpmRespectingTravelLimits,
} from "./railLimitGuards.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";
import {
  getControllerStatus,
  listControllers,
  startController,
  stopController,
} from "./controllerPhysics.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

function friendlySensorError(err: unknown): string {
  return friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function symmetricTravelLimitsFromMotorStatus(halfSpanCm: number) {
  return async () => {
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
    const limits = setTravelLimitsSymmetricAboutCm(teknicMeasuredToCm(p), halfSpanCm);
    return { ok: true as const, ...limits };
  };
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
    mode === "sim" ? resolveSimMotorGrpcUrl() : motor.defaultMotorGrpcUrl();
  const sensorUrl =
    mode === "sim" ? resolveSimSensorGrpcUrl() : sensor.defaultSensorGrpcUrl();

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
      /** Used when **`MOTOR_SIM_GRPC_URL`** / **`SENSOR_SIM_GRPC_URL`** are unset (simulation). */
      simDefaultUrl: defaultSimulationGrpcUrl(),
    })),
    rail: baseProcedure.query(() => ({
      /** Display motor counts per cm (`config.rail.displayCountsPerCm`, default 232.8). */
      displayCountsPerCm: displayCountsPerCm(),
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
      .input(
        z.object({
          rpm: z.number().finite(),
          maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await setJogVelocityRpmRespectingTravelLimits(input.rpm, {
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          });
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
        return homingResultForClient(
          await runWithHomingBypass(() => runRailHoming()),
        );
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
      /**
       * Left/right stops at `current ± halfSpanCm` (symmetric switch distance from present rail position).
       */
      setSymmetricSpan: publicProcedure
        .input(z.object({ halfSpanCm: z.number().finite().positive() }))
        .mutation(async ({ input }) => symmetricTravelLimitsFromMotorStatus(input.halfSpanCm)()),
    }),
    /** Teknic `ZeroMeasuredPosition` at the current location (display position becomes 0 cm). */
    zeroAtCurrent: publicProcedure.mutation(async () => {
      const st = await motor.getMotorStatus();
      if (!st.connected) {
        throw new Error("Motor is not connected.");
      }
      if (st.measuredPosition === undefined || !Number.isFinite(st.measuredPosition)) {
        throw new Error(
          "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
        );
      }
      try {
        const r = await motor.zeroMeasuredPosition();
        if (!r.ok) {
          throw new Error(r.error || "Motor zero failed.");
        }
        return { ok: true as const };
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    /** Teknic `MovePosnStart` absolute move — target rail position in cm. */
    moveAbsolute: publicProcedure
      .input(
        z.object({
          positionCm: z.number().finite(),
          /** Caps profile peak RPM (`Motion.VelLimit`). Omit to use motor-service default. */
          maxVelocityRpm: z.number().finite().positive().optional(),
          /** Caps profile acceleration (`Motion.AccLimit`, RPM/s when AccUnit is RPM_PER_SEC). Omit to use motor-service default. */
          maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const r = await moveToPositionCmRespectingTravelLimits(input.positionCm, {
            maxVelocityRpm: input.maxVelocityRpm,
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          });
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
    get: publicProcedure.query(async (): Promise<MotorStatusForClient> => readMotorStatusPayload()),
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
        .input(
          z.object({
            rpm: z.number().finite(),
            maxAccelerationRpmPerSec: z.number().finite().positive().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const opts = { maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec };
          const real = await withHardwareGrpc(async () => {
            try {
              return await setJogVelocityRpmRespectingTravelLimits(input.rpm, opts);
            } catch (e) {
              throw new Error(`motor: ${friendlyMotorError(e)}`);
            }
          });
          const sim = await withSimGrpc(async () => {
            try {
              return await setJogVelocityRpmRespectingTravelLimits(input.rpm, opts);
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
        const [real, sim] = await runWithHomingBypass(() =>
          Promise.all([
            withHardwareGrpc(() => runRailHoming()),
            withSimGrpc(() => runRailHoming()),
          ]),
        );
        return { real: homingResultForClient(real), sim: homingResultForClient(sim) };
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
        setSymmetricSpan: baseProcedure
          .input(z.object({ halfSpanCm: z.number().finite().positive() }))
          .mutation(async ({ input }) => {
            const real = await withHardwareGrpc(() =>
              symmetricTravelLimitsFromMotorStatus(input.halfSpanCm)(),
            );
            const sim = await withSimGrpc(async () => {
              try {
                return await symmetricTravelLimitsFromMotorStatus(input.halfSpanCm)();
              } catch (e) {
                return {
                  ok: false as const,
                  error: e instanceof Error ? e.message : String(e),
                };
              }
            });
            return { real, sim };
          }),
      }),
      zeroAtCurrent: baseProcedure.mutation(async () => {
        const real = await withHardwareGrpc(async () => {
          try {
            const st = await motor.getMotorStatus();
            if (!st.connected) {
              throw new Error("Motor is not connected.");
            }
            if (st.measuredPosition === undefined || !Number.isFinite(st.measuredPosition)) {
              throw new Error(
                "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
              );
            }
            const r = await motor.zeroMeasuredPosition();
            if (!r.ok) {
              throw new Error(r.error || "Motor zero failed.");
            }
            return { ok: true as const };
          } catch (e) {
            throw new Error(`motor: ${friendlyMotorError(e)}`);
          }
        });
        const sim = await withSimGrpc(async () => {
          try {
            const st = await motor.getMotorStatus();
            if (!st.connected) {
              return { ok: false as const, error: "Motor is not connected." };
            }
            if (st.measuredPosition === undefined || !Number.isFinite(st.measuredPosition)) {
              return {
                ok: false as const,
                error:
                  "Motor measured position unavailable — rebuild motor DLL / motor-service for PosnMeasured.",
              };
            }
            const r = await motor.zeroMeasuredPosition();
            if (!r.ok) {
              return { ok: false as const, error: r.error || "Motor zero failed." };
            }
            return { ok: true as const };
          } catch (e) {
            return { ok: false as const, error: friendlyMotorError(e) };
          }
        });
        return { real, sim };
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
          const opts = {
            maxVelocityRpm: input.maxVelocityRpm,
            maxAccelerationRpmPerSec: input.maxAccelerationRpmPerSec,
          };
          const real = await withHardwareGrpc(async () => {
            try {
              const r = await moveToPositionCmRespectingTravelLimits(input.positionCm, opts);
              if (!r.ok) {
                throw new Error(r.error);
              }
              return r;
            } catch (e) {
              throw new Error(`motor: ${friendlyMotorError(e)}`);
            }
          });
          const sim = await withSimGrpc(async () => {
            try {
              return await moveToPositionCmRespectingTravelLimits(input.positionCm, opts);
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
        get: baseProcedure.query(async () => {
          const real = await withHardwareGrpc(() =>
            readSensorStatusPayload({ trackLatch: false }),
          );
          const sim = await withSimGrpc(() => readSensorStatusPayload({ trackLatch: false }));
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
