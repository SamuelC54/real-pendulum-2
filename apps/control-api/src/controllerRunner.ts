import { config } from "@real-pendulum/app-config";

import {

  controllerServiceStart,

  controllerServiceStop,

  controllerServiceTick,

  type ControllerTickResult,

} from "@real-pendulum/controller-service/client";

import * as motor from "@real-pendulum/physical-motor-service/sdk";

import type { ControlClient } from "./control/ControlClient.js";
import { railStateForMode } from "./control/types.js";

import { rpmToCmPerSec } from "./control/motionUnits.js";

import { encoderTicksFromPhysicsState } from "./control/mappers/simulationMappers.js";

import {

  completeHomingFailure,

  completeHomingFromTick,

  type HomingTickComplete,

} from "./homingComplete.js";

import { isMotionBlocked, runWithHomingBypass } from "./limitSwitchMode/index.js";

import { cmToTeknicMeasured } from "./railPositionCm.js";

import { physicsSimGetState } from "@real-pendulum/simulation/client";



const TICK_MS = 200;

const LQR_TICK_MS = 50;

const HOMING_TICK_MS = 50;

const ARRIVAL_TOLERANCE_CM = 0.5;



let activeControllerId: string | null = null;

let activeControlClient: ControlClient | null = null;



let loopTimer: ReturnType<typeof setInterval> | null = null;

let loopError: string | null = null;

let lastCommandedCm: number | null = null;

let controllerStartedAtSec: number | null = null;



function stopLoopTimer(): void {

  if (loopTimer != null) {

    clearInterval(loopTimer);

    loopTimer = null;

  }

  lastCommandedCm = null;

  controllerStartedAtSec = null;

  activeControllerId = null;

  activeControlClient = null;

}



export function getControllerLoopError(): string | null {

  return loopError;

}



export function isControllerLoopRunning(): boolean {

  return loopTimer != null;

}



function homingParamsFromConfig(): Record<string, number> {

  const h = config.homing;

  return {

    jogRpm: h.jogRpm,

    midPositionTolerance: h.midPositionTolerance,

    approachPosition: h.approachPosition,

    approachRpm: h.approachRpm,

    zeroMotorAtMid: h.zeroMotorPositionAtMid ? 1 : 0,

    minTravelForLimitCounts: h.minTravelForLimitCounts,

    phaseTimeoutSec: h.phaseTimeoutMs / 1000,

  };

}



async function readControllerTickState(): Promise<{

  positionCm: number;

  timeSec: number;

  measuredPosition?: number;

  limitLeftPressed: boolean;

  limitRightPressed: boolean;

  cartConnected: boolean;

  sensorConnected: boolean;

  encoderTicks?: number;

}> {

  const client = activeControlClient!;

  const mode = client.mode;

  const state = railStateForMode(await client.getState(), mode);

  if (!state.connection.cart) {

    throw new Error("Motor is not connected — connect on the Control tab first.");

  }

  if (state.cart.positionCm === null || !Number.isFinite(state.cart.positionCm)) {

    throw new Error("Motor position unavailable — home or zero the rail if needed.");

  }



  const timeSec =

    controllerStartedAtSec != null

      ? Date.now() / 1000 - controllerStartedAtSec

      : Date.now() / 1000;



  let measuredPosition: number | undefined;

  if (mode === "physical" || mode === "twin") {

    const st = await motor.getMotorStatus();

    if (st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)) {

      measuredPosition = st.measuredPosition;

    }

  } else {

    measuredPosition = cmToTeknicMeasured(state.cart.positionCm);

  }



  const tickState = {

    positionCm: state.cart.positionCm,

    timeSec,

    measuredPosition,

    limitLeftPressed: state.limitSwitch.leftPressed,

    limitRightPressed: state.limitSwitch.rightPressed,

    cartConnected: state.connection.cart,

    sensorConnected: state.connection.sensor,

  };



  if (activeControllerId === "lqr_position") {

    if (mode === "simulation") {

      const payload = await physicsSimGetState();

      return { ...tickState, encoderTicks: encoderTicksFromPhysicsState(payload.state) };

    }

    return { ...tickState, encoderTicks: state.pendulum.encoderTicks };

  }



  return tickState;

}



async function applyHomingTickResult(out: ControllerTickResult): Promise<boolean> {

  if (out.error && out.done) {

    await completeHomingFailure(

      out.error,

      out.log ?? [],

      out.motorAbsRevolutions,

    );

    return true;

  }

  if (out.done && out.homingResult) {

    await completeHomingFromTick(

      out.homingResult as HomingTickComplete,

      out.log ?? [],

      out.motorAbsRevolutions,

      activeControlClient!,

    );

    return true;

  }

  return Boolean(out.done || out.idle);

}



async function controllerTick(): Promise<boolean> {

  const client = activeControlClient!;

  try {

    if (isMotionBlocked() && activeControllerId !== "rail_homing") {

      await stopControllerRunner();

      return true;

    }



    const tickState = await readControllerTickState();

    const out = await controllerServiceTick(tickState);



    if (activeControllerId === "rail_homing") {

      if (out.rpm !== undefined && Number.isFinite(out.rpm)) {

        const jog = await client.setJogCmPerSec(rpmToCmPerSec(out.rpm));

        if (!jog.ok) {

          throw new Error(jog.error || "Homing jog rejected.");

        }

      } else if (out.rpm === 0) {

        await client.stop();

      }

      if (await applyHomingTickResult(out)) {

        await stopControllerRunner();

        return true;

      }

      loopError = null;

      return false;

    }



    if (out.done || out.idle) {

      await stopControllerRunner();

      return true;

    }



    if (out.rpm !== undefined && Number.isFinite(out.rpm)) {

      const jog = await client.setJogCmPerSec(rpmToCmPerSec(out.rpm));

      if (!jog.ok) {

        throw new Error(jog.error || "Jog rejected.");

      }

    }



    if (out.positionCm !== undefined && Number.isFinite(out.positionCm)) {

      const target = out.positionCm;

      const minDelta = out.minCommandDeltaCm ?? ARRIVAL_TOLERANCE_CM;

      const needsMove = out.streamPosition

        ? lastCommandedCm === null || Math.abs(target - lastCommandedCm) >= minDelta

        : lastCommandedCm === null ||

          Math.abs(target - lastCommandedCm) > 1e-6 ||

          Math.abs(tickState.positionCm - target) > ARRIVAL_TOLERANCE_CM;



      if (needsMove) {

        const move = await client.moveToPositionCm(target, {

          maxVelocityRpm: out.maxVelocityRpm,

          maxAccelerationRpmPerSec: out.maxAccelerationRpmPerSec,

        });

        if (!move.ok) {

          throw new Error(move.error || "Move rejected.");

        }

        lastCommandedCm = target;

      }

    }



    loopError = null;

    return false;

  } catch (e) {

    loopError = e instanceof Error ? e.message : String(e);

    stopLoopTimer();

    try {

      await controllerServiceStop();

    } catch {

      /* best effort */

    }

    return true;

  }

}



export async function startControllerRunner(

  id: string,

  params: Record<string, number>,

  controlClient: ControlClient,

): Promise<void> {

  if (loopTimer != null) {

    throw new Error("A controller is already running.");

  }



  const mergedParams = id === "rail_homing" ? { ...homingParamsFromConfig(), ...params } : params;



  const start = async () => {

    loopError = null;

    lastCommandedCm = null;

    controllerStartedAtSec = Date.now() / 1000;

    activeControlClient = controlClient;



    await controllerServiceStart(id, mergedParams);

    activeControllerId = id;



    const tickState = await readControllerTickState();

    if (id === "rail_homing") {

      if (!tickState.sensorConnected) {

        throw new Error("Connect the sensor board on the Control tab before homing.");

      }

    } else if (id === "lqr_position" && controlClient.mode !== "simulation") {

      if (!tickState.sensorConnected) {

        throw new Error(

          "Connect the sensor board on the Control tab before starting LQR balance.",

        );

      }

    }



    const finished = await controllerTick();

    if (finished || loopTimer != null) {

      return;

    }



    const tickMs =

      id === "lqr_position" ? LQR_TICK_MS : id === "rail_homing" ? HOMING_TICK_MS : TICK_MS;

    loopTimer = setInterval(() => {

      void controllerTick();

    }, tickMs);

  };



  if (id === "rail_homing") {

    await runWithHomingBypass(start);

    return;

  }

  await start();

}



export async function stopControllerRunner(): Promise<void> {

  const client = activeControlClient;

  stopLoopTimer();

  if (client) {

    await client.stop().catch(() => {});

  }

  await controllerServiceStop();

}

