import type { PhysicsSimStatePayload } from "@real-pendulum/simulation/client";
import { physicsStateToCm } from "@real-pendulum/simulation/client";
import type { RailMachineState, TravelLimitsCm } from "../../types.js";

let simLedOn = false;
let simCartOffsetCm = 0;

export function setSimulationLedState(on: boolean): void {
  simLedOn = on;
}

/** Redefine displayed/commanded cart frame so current plant x reads as 0 cm. */
export function setSimulationCartOffsetAtCurrent(xCm: number): void {
  simCartOffsetCm = xCm;
}

export function simulationCartOffsetCm(): number {
  return simCartOffsetCm;
}

export function resetSimulationLedStateForTests(): void {
  simLedOn = false;
  simCartOffsetCm = 0;
}

export function railStateFromPhysicsSim(
  payload: PhysicsSimStatePayload,
  travelLimitsCm: TravelLimitsCm,
  options?: { plantReachable?: boolean },
): RailMachineState {
  const { state } = payload;
  const cm = physicsStateToCm(state);
  const reachable = options?.plantReachable ?? true;
  const angleDeg = (cm.thetaRad * 180) / Math.PI;
  const positionCm = cm.xCm - simCartOffsetCm;

  return {
    status: reachable ? "idle" : "disconnected",
    connection: {
      cart: reachable,
      sensor: reachable,
    },
    cart: {
      positionCm,
      commandedCmPerSec: cm.vCmdCmPerSec,
      travelLimitsCm: { ...travelLimitsCm },
    },
    pendulum: {
      angleDeg,
      encoderTicks: cm.encoderTicks,
    },
    led: {
      on: simLedOn,
    },
    limitSwitch: {
      leftPressed: Boolean(cm.limitLeftPressed),
      rightPressed: Boolean(cm.limitRightPressed),
    },
  };
}

export function encoderTicksFromPhysicsState(state: PhysicsSimStatePayload["state"]): number {
  return Math.round(state.encoderTicksFloat);
}
