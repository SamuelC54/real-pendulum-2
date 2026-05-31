import { config } from "@real-pendulum/app-config";

/** MuJoCo left limit-switch plate x (m). */
export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

/** MuJoCo right limit-switch plate x (m). */
export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
