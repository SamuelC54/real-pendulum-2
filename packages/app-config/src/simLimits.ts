import { config } from "./config.js";

/** Simulation left limit-switch plate x (m) in MuJoCo (`limit_switch_left` body). */
export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

/** Simulation right limit-switch plate x (m) in MuJoCo (`limit_switch_right` body). */
export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
