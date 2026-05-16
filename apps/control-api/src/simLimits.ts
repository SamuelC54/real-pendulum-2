import { config } from "@real-pendulum/app-config";

export function simLimitLeftXM(): number {
  return config.sim.limitLeftXM;
}

export function simLimitRightXM(): number {
  return config.sim.limitRightXM;
}
