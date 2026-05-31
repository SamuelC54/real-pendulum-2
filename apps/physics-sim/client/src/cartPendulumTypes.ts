export type CartPendulumConfig = {
  gravity: number;
  pendulumLengthM: number;
  cartVelocityTrackingPerSec: number;
  angularDampingPerSec: number;
  encoderTicksPerRadian: number;
  maxInternalStepSec: number;
  /** MuJoCo limit-switch plate x (m); optional until synced from physics-sim. */
  limitLeftXM?: number;
  limitRightXM?: number;
};

export type CartPendulumState = {
  xM: number;
  vMps: number;
  thetaRad: number;
  omegaRps: number;
  vCmdMps: number;
  encoderTicksFloat: number;
  /** From MuJoCo touch sensors (updated each physics step). */
  limitLeftPressed?: boolean;
  limitRightPressed?: boolean;
};

export type CartPendulumPlant = {
  readonly config: Readonly<CartPendulumConfig>;
  readonly state: CartPendulumState;
};
