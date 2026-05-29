import { config } from "@real-pendulum/app-config";
import * as motor from "@real-pendulum/motor-service/sdk";
import {
  getMotionLatchStatus,
  isMotionLatched,
  runWithRecoveryMoveBypass,
} from "./motionLatch.js";
import { withHardwareGrpc, withSimGrpc } from "./twinGrpc.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

const DEFAULT_JOG_RPM = Math.min(120, Math.max(5, config.homing.jogRpm));
const DEFAULT_ACC_RPM_PER_SEC = 1000;

/** Signed RPM toward rail center (0 cm) from current latch side. */
export function recoveryJogRpmTowardCenter(magnitudeRpm = DEFAULT_JOG_RPM): number | null {
  const { latched, towardCenterJog } = getMotionLatchStatus();
  if (!latched || !towardCenterJog) return null;
  const mag = Math.abs(magnitudeRpm);
  return towardCenterJog === "left" ? mag : -mag;
}

async function setRecoveryJogOnBackend(
  rpm: number,
  maxAccelerationRpmPerSec?: number,
): Promise<{ ok: boolean; error: string }> {
  if (!isMotionLatched()) {
    return { ok: false, error: "Not latched — use normal jog controls." };
  }
  const toward = recoveryJogRpmTowardCenter(Math.abs(rpm));
  if (toward === null) {
    return { ok: false, error: "Latch side unknown — release stop and retry." };
  }
  const signed = rpm === 0 ? 0 : Math.sign(toward) * Math.abs(rpm);
  return runWithRecoveryMoveBypass(async () => {
    if (maxAccelerationRpmPerSec !== undefined) {
      return motor.setJogVelocityRpm(signed, { maxAccelerationRpmPerSec });
    }
    return motor.setJogVelocityRpm(signed);
  });
}

async function stopRecoveryJogOnBackend(): Promise<{ ok: boolean; error: string }> {
  return runWithRecoveryMoveBypass(() => motor.stopMotor());
}

export async function startRecoveryJog(
  mode: GrpcBackendMode,
  options?: { rpm?: number; maxAccelerationRpmPerSec?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpm = options?.rpm ?? DEFAULT_JOG_RPM;
  const acc = options?.maxAccelerationRpmPerSec ?? DEFAULT_ACC_RPM_PER_SEC;

  if (mode === "twin") {
    const [real, sim] = await Promise.all([
      withHardwareGrpc(() => setRecoveryJogOnBackend(rpm, acc)),
      withSimGrpc(() => setRecoveryJogOnBackend(rpm, acc)),
    ]);
    if (!real.ok) return real;
    if (!sim.ok) return { ok: false, error: `Sim: ${sim.error}` };
    return { ok: true };
  }

  const run = () => setRecoveryJogOnBackend(rpm, acc);
  if (mode === "sim") return withSimGrpc(run);
  return withHardwareGrpc(run);
}

export async function stopRecoveryJog(
  mode: GrpcBackendMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mode === "twin") {
    await Promise.all([
      withHardwareGrpc(() => stopRecoveryJogOnBackend()),
      withSimGrpc(() => stopRecoveryJogOnBackend()),
    ]);
    return { ok: true };
  }
  const run = () => stopRecoveryJogOnBackend();
  if (mode === "sim") return withSimGrpc(run);
  return withHardwareGrpc(run);
}
