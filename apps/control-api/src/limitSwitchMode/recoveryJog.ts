import { config } from "@real-pendulum/app-config";
import { createControlClient } from "../control/createControlClient.js";
import { rpmToCmPerSec } from "../control/motionUnits.js";
import type { ControlMode } from "../helpers/backendContext.js";
import { getLimitSwitchModeStatus, isLatched, runWithRecoveryBypass } from "./state.js";
import { runOnTwinLegs } from "./twinLegs.js";

const DEFAULT_JOG_RPM = Math.min(120, Math.max(5, config.homing.jogRpm));
const DEFAULT_ACC_RPM_PER_SEC = 1000;

export function recoveryJogRpmTowardCenter(magnitudeRpm = DEFAULT_JOG_RPM): number | null {
  const { latched, towardCenterJog } = getLimitSwitchModeStatus();
  if (!latched || !towardCenterJog) return null;
  const mag = Math.abs(magnitudeRpm);
  return towardCenterJog === "left" ? mag : -mag;
}

async function setRecoveryJog(
  mode: Exclude<ControlMode, "twin">,
  rpm: number,
  maxAccelerationRpmPerSec?: number,
): Promise<{ ok: boolean; error: string }> {
  if (!isLatched()) {
    return { ok: false, error: "Not latched — use normal jog controls." };
  }
  const toward = recoveryJogRpmTowardCenter(Math.abs(rpm));
  if (toward === null) {
    return { ok: false, error: "Latch side unknown — release stop and retry." };
  }
  const signed = rpm === 0 ? 0 : Math.sign(toward) * Math.abs(rpm);
  return runWithRecoveryBypass(() =>
    createControlClient(mode).setJogCmPerSec(rpmToCmPerSec(signed), {
      maxAccelerationRpmPerSec,
    }),
  );
}

export async function startRecoveryJog(
  mode: ControlMode,
  options?: { rpm?: number; maxAccelerationRpmPerSec?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpm = options?.rpm ?? DEFAULT_JOG_RPM;
  const acc = options?.maxAccelerationRpmPerSec ?? DEFAULT_ACC_RPM_PER_SEC;
  const result = await runOnTwinLegs(mode, (leg) => setRecoveryJog(leg, rpm, acc));

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
    runWithRecoveryBypass(() => createControlClient(leg).stop()),
  );

  if ("real" in result) return { ok: true };
  return result.ok ? { ok: true } : result;
}
