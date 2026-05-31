import { config } from "@real-pendulum/app-config";
import { createControlClient, createTwinControlBackend } from "./control/createControlClient.js";
import { rpmToCmPerSec } from "./control/motionUnits.js";
import {
  getMotionLatchStatus,
  isMotionLatched,
  runWithRecoveryMoveBypass,
} from "./motionLatch.js";
import type { GrpcBackendMode } from "./grpcRequestContext.js";

const DEFAULT_JOG_RPM = Math.min(120, Math.max(5, config.homing.jogRpm));
const DEFAULT_ACC_RPM_PER_SEC = 1000;

export function recoveryJogRpmTowardCenter(magnitudeRpm = DEFAULT_JOG_RPM): number | null {
  const { latched, towardCenterJog } = getMotionLatchStatus();
  if (!latched || !towardCenterJog) return null;
  const mag = Math.abs(magnitudeRpm);
  return towardCenterJog === "left" ? mag : -mag;
}

async function setRecoveryJogOnBackend(
  mode: GrpcBackendMode,
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
  return runWithRecoveryMoveBypass(() =>
    createControlClient(mode).setJogCmPerSec(rpmToCmPerSec(signed), {
      maxAccelerationRpmPerSec,
    }),
  );
}

async function stopRecoveryJogOnBackend(
  mode: GrpcBackendMode,
): Promise<{ ok: boolean; error: string }> {
  return runWithRecoveryMoveBypass(() => createControlClient(mode).stop());
}

export async function startRecoveryJog(
  mode: GrpcBackendMode,
  options?: { rpm?: number; maxAccelerationRpmPerSec?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpm = options?.rpm ?? DEFAULT_JOG_RPM;
  const acc = options?.maxAccelerationRpmPerSec ?? DEFAULT_ACC_RPM_PER_SEC;

  if (mode === "twin") {
    const twin = createTwinControlBackend();
    const [real, sim] = await Promise.all([
      setRecoveryJogOnBackend("hardware", rpm, acc),
      setRecoveryJogOnBackend("sim", rpm, acc),
    ]);
    if (!real.ok) return real;
    if (!sim.ok) return { ok: false, error: `Sim: ${sim.error}` };
    return { ok: true };
  }

  return setRecoveryJogOnBackend(mode, rpm, acc);
}

export async function stopRecoveryJog(
  mode: GrpcBackendMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mode === "twin") {
    await Promise.all([
      stopRecoveryJogOnBackend("hardware"),
      stopRecoveryJogOnBackend("sim"),
    ]);
    return { ok: true };
  }
  const r = await stopRecoveryJogOnBackend(mode);
  if (!r.ok) return r;
  return { ok: true };
}
