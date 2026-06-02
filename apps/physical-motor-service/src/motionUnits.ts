import { simMpsPerRpm } from "@real-pendulum/app-config/sim-plant";

/** Teknic jog: +RPM moves rail in +display-count direction; +cm/s is the UI convention. */
export function rpmToCmPerSec(rpm: number): number {
  const mpsPerRpm = simMpsPerRpm();
  return -rpm * mpsPerRpm * 100;
}

export function cmPerSecToRpm(cmPerSec: number): number {
  const mpsPerRpm = simMpsPerRpm();
  if (mpsPerRpm === 0) return 0;
  return -(cmPerSec / 100) / mpsPerRpm;
}

export function cmPerSec2ToRpmPerSec(cmPerSec2: number): number {
  const mpsPerRpm = simMpsPerRpm();
  if (mpsPerRpm === 0) return 0;
  return -(cmPerSec2 / 100) / mpsPerRpm;
}

export function rpmPerSecToCmPerSec2(rpmPerSec: number): number {
  const mpsPerRpm = simMpsPerRpm();
  return -rpmPerSec * mpsPerRpm * 100;
}
