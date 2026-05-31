import type { PhysicsSimStatePayload } from "@real-pendulum/physics-sim/client";
import { encoderTicksPerRadian } from "../../pendulumEncoder.js";
import { getTravelLimitDisplays } from "../../railTravelLimits.js";
import { travelLimitsToCm } from "../../railPositionCm.js";
import { cmPerSecFromMps } from "../motionUnits.js";
import type { RailMachineState } from "../types.js";

let simLedOn = false;

export function setSimulationLedState(on: boolean): void {
  simLedOn = on;
}

export function resetSimulationLedStateForTests(): void {
  simLedOn = false;
}

export function railStateFromPhysicsSim(
  payload: PhysicsSimStatePayload,
  options?: { plantReachable?: boolean },
): RailMachineState {
  const { state } = payload;
  const reachable = options?.plantReachable ?? true;
  const angleDeg = (state.thetaRad * 180) / Math.PI;
  const positionCm = state.xM * 100;
  const travelLimits = travelLimitsToCm(getTravelLimitDisplays());

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
