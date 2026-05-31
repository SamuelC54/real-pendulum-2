import { config } from "@real-pendulum/app-config";

/** Simulation left limit (m) — keep in sync with `config.sim.limitLeftXM`. */
export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

/** Simulation right limit (m) — keep in sync with `config.sim.limitRightXM`. */
export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
