import { config } from "./config.js";

/** Coupled sim left travel limit — cart `xM` (m) at or below asserts left switch. */
export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

/** Coupled sim right travel limit — cart `xM` (m) at or above asserts right switch. */
export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
