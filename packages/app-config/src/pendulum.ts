import { config } from "./config.js";

/** Quadrature counts per revolution on the pendulum shaft encoder. */
export function encoderCountsPerRevolution(): number {
  return config.pendulum.encoderCountsPerRevolution;
}

/** Coupled cart–pendulum plant gravity (m/s²). */
export function plantGravityMS2(): number {
  const g = config.pendulum.gravityMS2;
  if (!Number.isFinite(g) || g <= 0) {
    throw new Error("config.pendulum.gravityMS2 must be a positive finite number.");
  }
  return g;
}

/** Sim plant and hardware use the same ticks/radian derived from CPR. */
export function encoderTicksPerRadian(): number {
  const cpr = encoderCountsPerRevolution();
  if (!Number.isFinite(cpr) || cpr <= 0) {
    throw new Error("config.pendulum.encoderCountsPerRevolution must be a positive finite number.");
  }
  return cpr / (2 * Math.PI);
}
