import { config } from "./config.js";

export type SimPlantParameters = {
  mpsPerRpm: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
};

/** MuJoCo plant tuning and simulation jog scale from `config.sim.plant`. */
export function getSimPlantParameters(): SimPlantParameters {
  return { ...config.sim.plant };
}

export function simMpsPerRpm(): number {
  return config.sim.plant.mpsPerRpm;
}
