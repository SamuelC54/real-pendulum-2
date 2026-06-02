import { config } from "@real-pendulum/app-config";
import { rpmToCmPerSec } from "@real-pendulum/physical-motor-service/sdk";
import { getControlBackend } from "../control/getControlBackend.js";
import type { ControlMode } from "../helpers/backendContext.js";
import { getLimitSwitchModeStatus, isLatched, runWithRecoveryBypass } from "./state.js";
import { runOnTwinLegs } from "./twinLegs.js";

const DEFAULT_JOG_CM_PER_SEC = Math.abs(
  rpmToCmPerSec(Math.min(120, Math.max(5, config.homing.jogRpm))),
);
const DEFAULT_ACC_CM_PER_SEC2 = Math.abs(rpmToCmPerSec(1000));

export function recoveryJogCmPerSecTowardCenter(
  magnitudeCmPerSec = DEFAULT_JOG_CM_PER_SEC,
): number | null {
  const { latched, towardCenterJog } = getLimitSwitchModeStatus();
  if (!latched || !towardCenterJog) return null;
  const mag = Math.abs(magnitudeCmPerSec);
  return towardCenterJog === "left" ? mag : -mag;
}

/** @deprecated Use {@link recoveryJogCmPerSecTowardCenter} */
export const recoveryJogRpmTowardCenter = recoveryJogCmPerSecTowardCenter;

async function setRecoveryJog(
  mode: Exclude<ControlMode, "twin">,
  cmPerSec: number,
  maxAccelerationCmPerSec2?: number,
): Promise<{ ok: boolean; error: string }> {
  if (!isLatched()) {
    return { ok: false, error: "Not latched — use normal jog controls." };
  }
  const toward = recoveryJogCmPerSecTowardCenter(Math.abs(cmPerSec));
  if (toward === null) {
    return { ok: false, error: "Latch side unknown — release stop and retry." };
  }
  const signed = cmPerSec === 0 ? 0 : Math.sign(toward) * Math.abs(cmPerSec);
  return runWithRecoveryBypass(() =>
    getControlBackend(mode).setJogCmPerSec(signed, {
      maxAccelerationCmPerSec2,
    }),
  );
}

export async function startRecoveryJog(
  mode: ControlMode,
  options?: { cmPerSec?: number; maxAccelerationCmPerSec2?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cmPerSec = options?.cmPerSec ?? DEFAULT_JOG_CM_PER_SEC;
  const acc = options?.maxAccelerationCmPerSec2 ?? DEFAULT_ACC_CM_PER_SEC2;
  const result = await runOnTwinLegs(mode, (leg) => setRecoveryJog(leg, cmPerSec, acc));

  if ("real" in result) {
    if (!result.real.ok) return result.real;
    if (!result.sim.ok) return { ok: false, error: `Sim: ${result.sim.error}` };
    return { ok: true };
  }
  return result.ok ? { ok: true } : result;
}

export async function stopRecoveryJog(
  mode: ControlMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await runOnTwinLegs(mode, (leg) =>
    runWithRecoveryBypass(() => getControlBackend(leg).stop()),
  );

  if ("real" in result) return { ok: true };
  return result.ok ? { ok: true } : result;
}
