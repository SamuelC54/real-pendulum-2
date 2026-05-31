import { config } from "./config.js";

/** Simulation left travel limit — cart `xM` (m) at or below asserts left switch. */
export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

/** Simulation right travel limit — cart `xM` (m) at or above asserts right switch. */
export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
