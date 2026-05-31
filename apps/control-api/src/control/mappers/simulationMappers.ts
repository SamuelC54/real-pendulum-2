import type { PhysicsSimStatePayload } from "@real-pendulum/simulation/client";
import { getTravelLimitDisplays } from "../../railTravelLimits.js";
import { travelLimitsToCm } from "../../railPositionCm.js";
import { cmPerSecFromMps } from "../motionUnits.js";
import type { RailMachineState } from "../types.js";

let simLedOn = false;
let simCartOffsetM = 0;

export function setSimulationLedState(on: boolean): void {
  simLedOn = on;
}

/** Redefine displayed/commanded cart frame so current plant x reads as 0 cm. */
export function setSimulationCartOffsetAtCurrent(xM: number): void {
  simCartOffsetM = xM;
}

export function simulationCartOffsetM(): number {
  return simCartOffsetM;
}

export function resetSimulationLedStateForTests(): void {
  simLedOn = false;
  simCartOffsetM = 0;
}

export function railStateFromPhysicsSim(
  payload: PhysicsSimStatePayload,
  options?: { plantReachable?: boolean },
): RailMachineState {
  const { state } = payload;
  const reachable = options?.plantReachable ?? true;
  const angleDeg = (state.thetaRad * 180) / Math.PI;
  const positionCm = (state.xM - simCartOffsetM) * 100;
  const travelLimits = travelLimitsToCm(getTravelLimitDisplays("simulation"));

  return {
    status: reachable ? "idle" : "disconnected",
    connection: {
      cart: reachable,
      sensor: reachable,
    },
    cart: {
      positionCm,
      commandedCmPerSec: cmPerSecFromMps(state.vCmdMps),
      travelLimitsCm: {
        left: travelLimits.leftCm,
        right: travelLimits.rightCm,
      },
    },
    pendulum: {
      angleDeg,
      encoderTicks: Math.round(state.encoderTicksFloat),
    },
    led: {
      on: simLedOn,
    },
    limitSwitch: {
      leftPressed: Boolean(state.limitLeftPressed),
      rightPressed: Boolean(state.limitRightPressed),
    },
  };
}

export function encoderTicksFromPhysicsState(state: PhysicsSimStatePayload["state"]): number {
  return Math.round(state.encoderTicksFloat);
}
