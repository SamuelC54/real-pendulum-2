import { config } from "@real-pendulum/app-config";

/** Shaft encoder CPR — shared by Arduino firmware and simulation. */
export function encoderCountsPerRevolution(): number {
  return config.pendulum.encoderCountsPerRevolution;
}

export function encoderTicksPerRadian(): number {
  return encoderCountsPerRevolution() / (2 * Math.PI);
}

export function plantGravityMS2(): number {
  return config.pendulum.gravityMS2;
}
