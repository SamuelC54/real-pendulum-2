export type CartPendulumConfig = {
  gravity: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
  encoderTicksPerRadian: number;
  maxInternalStepSec: number;
};

export type CartPendulumState = {
  xM: number;
  vMps: number;
  thetaRad: number;
  omegaRps: number;
  vCmdMps: number;
  encoderTicksFloat: number;
};

export type CartPendulumPlant = {
  readonly config: Readonly<CartPendulumConfig>;
  readonly state: CartPendulumState;
};
