/**
 * In-memory cart–pendulum state mirror synced from MuJoCo (`physics-sim` HTTP).
 */

import type { CartPendulumConfig, CartPendulumPlant, CartPendulumState } from "./cartPendulumTypes.js";

export type { CartPendulumConfig, CartPendulumPlant, CartPendulumState } from "./cartPendulumTypes.js";

const DEFAULT_CONFIG: CartPendulumConfig = {
  gravity: 9.80665,
  pendulumLengthM: 0.35,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.04,
  encoderTicksPerRadian: 2400 / (2 * Math.PI),
  maxInternalStepSec: 1 / 240,
};

export function createCartPendulumPlant(
  partial?: Partial<CartPendulumConfig>,
  initial?: Partial<Pick<CartPendulumState, "xM" | "vMps" | "thetaRad" | "omegaRps" | "vCmdMps">>,
): CartPendulumPlant {
  const config = { ...DEFAULT_CONFIG, ...partial };
  const state: CartPendulumState = {
    xM: initial?.xM ?? 0,
    vMps: initial?.vMps ?? 0,
    thetaRad: initial?.thetaRad ?? 0,
    omegaRps: initial?.omegaRps ?? 0,
    vCmdMps: initial?.vCmdMps ?? 0,
    encoderTicksFloat: 0,
  };
  return { config, state };
}

export function encoderTicksInt(plant: CartPendulumPlant): number {
  return Math.round(plant.state.encoderTicksFloat);
}
