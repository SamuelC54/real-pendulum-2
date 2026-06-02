/** Cart rail position/velocity in cm and cm/s (plant HTTP API still uses SI meters internally). */

export function mToCm(m: number): number {
  return m * 100;
}

export function cmToM(cm: number): number {
  return cm / 100;
}

export function mpsToCmPerSec(mps: number): number {
  return mps * 100;
}

export function cmPerSecToMps(cmPerSec: number): number {
  return cmPerSec / 100;
}
