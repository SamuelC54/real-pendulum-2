import { readSimulationParametersFile } from "@real-pendulum/app-config/simulation-parameters";

/** Teknic/simulation jog: +RPM moves rail in +cm/s direction. */
export function rpmToCmPerSec(rpm: number): number {
  const { mpsPerRpm } = readSimulationParametersFile();
  return -rpm * mpsPerRpm * 100;
}

export function cmPerSecToRpm(cmPerSec: number): number {
  const { mpsPerRpm } = readSimulationParametersFile();
  if (mpsPerRpm === 0) return 0;
  return -(cmPerSec / 100) / mpsPerRpm;
}

export function cmPerSecFromMps(vMps: number): number {
  return vMps * 100;
}

export function mpsFromCmPerSec(cmPerSec: number): number {
  return cmPerSec / 100;
}
