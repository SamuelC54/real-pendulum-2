/**
 * Closed-loop PPO on the real cart–pendulum: read motor + encoder, predict via physics-sim,
 * command Teknic jog RPM at 30 Hz.
 */
import {
  physicsSimRlInferencePredict,
  physicsSimRlInferenceStart,
  physicsSimRlInferenceStop,
} from "@real-pendulum/physics-sim/client";
import { encoderTicksPerRadian } from "./pendulumEncoder.js";
import { readMotorStatusPayload, readSensorStatusPayload } from "./statusPayload.js";
import { isMotionBlockedByLatch } from "./motionLatch.js";
import { setJogVelocityRpmRespectingTravelLimits } from "./railLimitGuards.js";
import { withHardwareGrpc } from "./twinGrpc.js";

const DT_SEC = 1 / 30;

type RawSample = {
  xM: number;
  thetaRad: number;
  tMs: number;
};

let loopTimer: ReturnType<typeof setInterval> | null = null;
let previous: RawSample | null = null;
let loopError: string | null = null;

function buildRawObservation(
  positionCm: number,
  encoderTicks: number,
  prev: RawSample | null,
  nowMs: number,
): [number, number, number, number] {
  const xM = positionCm / 100;
  const thetaRad = encoderTicks / encoderTicksPerRadian();
  let vMps = 0;
  let omegaRps = 0;
  if (prev != null) {
    const dt = Math.max(1e-6, (nowMs - prev.tMs) / 1000);
    vMps = (xM - prev.xM) / dt;
    omegaRps = (thetaRad - prev.thetaRad) / dt;
  }
  return [xM, thetaRad, vMps, omegaRps];
}

async function hardwareInferenceTick(): Promise<void> {
  try {
    if (isMotionBlockedByLatch()) {
      await stopHardwareInference();
      return;
    }
    const motor = await withHardwareGrpc(() => readMotorStatusPayload());
    const sensor = await withHardwareGrpc(() => readSensorStatusPayload());

    if (!motor.connected) {
      throw new Error("Hardware motor is not connected.");
    }
    if (!sensor.connected) {
      throw new Error("Hardware sensor is not connected.");
    }
    if (motor.positionCm === undefined || !Number.isFinite(motor.positionCm)) {
      throw new Error("Motor position unavailable — connect motor and zero/home if needed.");
    }

    const nowMs = Date.now();
    const raw = buildRawObservation(motor.positionCm, sensor.encoderTicks, previous, nowMs);
    previous = { xM: raw[0], thetaRad: raw[1], tMs: nowMs };

    const out = await physicsSimRlInferencePredict(raw);
    const jog = await withHardwareGrpc(() => setJogVelocityRpmRespectingTravelLimits(out.rpm));
    if (!jog.ok) {
      throw new Error(jog.error || "Motor rejected jog velocity.");
    }
    loopError = null;
  } catch (e) {
    loopError = e instanceof Error ? e.message : String(e);
    await stopHardwareInferenceLoop();
    try {
      await physicsSimRlInferenceStop();
    } catch {
      /* best effort */
    }
    try {
      await withHardwareGrpc(() => setJogVelocityRpmRespectingTravelLimits(0));
    } catch {
      /* best effort */
    }
  }
}

function stopHardwareInferenceLoop(): void {
  if (loopTimer != null) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  previous = null;
}

export function getHardwareInferenceLoopError(): string | null {
  return loopError;
}

export function isHardwareInferenceLoopRunning(): boolean {
  return loopTimer != null;
}

export async function startHardwareInference(generation: number): Promise<void> {
  if (loopTimer != null) {
    throw new Error("Hardware AI is already running.");
  }
  loopError = null;
  previous = null;

  await physicsSimRlInferenceStart(generation, { target: "hardware" });

  const motor = await withHardwareGrpc(() => readMotorStatusPayload());
  const sensor = await withHardwareGrpc(() => readSensorStatusPayload());
  if (!motor.connected) {
    await physicsSimRlInferenceStop();
    throw new Error("Connect hardware motor on the Control tab before starting AI.");
  }
  if (!sensor.connected) {
    await physicsSimRlInferenceStop();
    throw new Error("Connect hardware sensor on the Control tab before starting AI.");
  }

  await hardwareInferenceTick();
  loopTimer = setInterval(() => {
    void hardwareInferenceTick();
  }, DT_SEC * 1000);
}

export async function stopHardwareInference(): Promise<void> {
  stopHardwareInferenceLoop();
  try {
    await withHardwareGrpc(() => setJogVelocityRpmRespectingTravelLimits(0));
  } catch {
    /* motor may already be disconnected */
  }
  await physicsSimRlInferenceStop();
}
