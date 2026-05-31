import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import {
  getMotionLatchStatus,
  isMotionBlockedByLatch,
  motionLatchErrorMessage,
  updateLimitSwitchState,
  updateMotorPositionForLatch,
} from "../../motionLatch.js";
import { friendlyMotorGrpcError } from "../../motorErrors.js";
import { friendlySensorGrpcError } from "../../sensorErrors.js";
import { encoderTicksPerRadian } from "../../pendulumEncoder.js";
import { cmToTeknicMeasured, teknicMeasuredToCm, travelLimitsToCm } from "../../railPositionCm.js";
import {
  getTravelLimitDisplays,
  setTravelLimitsFromCm,
  syncTravelLimitsFromMotorConnection,
} from "../../railTravelLimits.js";
import {
  clampJogRpmForTravelLimits,
  guardMoveAbsolutePositionCm,
} from "../../railLimitGuards.js";
import { cmPerSecToRpm } from "../motionUnits.js";
import { railStateCommandedCmPerSecFromMotor } from "../mappers/statusMappers.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  RailMachineState,
  TravelLimitsCm,
} from "../types.js";

function deriveMachineStatus(
  cartConnected: boolean,
  sensorConnected: boolean,
): RailMachineState["status"] {
  if (!cartConnected && !sensorConnected) return "disconnected";
  if (isMotionBlockedByLatch()) return "latched";
  const latch = getMotionLatchStatus();
  if (latch.latched) return "latched";
  return "idle";
}

export class PhysicalControlBackend implements ControlBackend {
  async getState(): Promise<RailMachineState> {
    let cartConnected = false;
    let sensorConnected = false;
    let positionCm: number | null = null;
    let commandedCmPerSec = 0;
    let detail: string | undefined;
    let angleDeg = 0;
    let ledOn = false;
    let leftPressed = false;
    let rightPressed = false;
    let encoderTicks = 0;

    try {
      const st = await motor.getMotorStatus();
      syncTravelLimitsFromMotorConnection(st.connected);
      cartConnected = st.connected;
      commandedCmPerSec = railStateCommandedCmPerSecFromMotor(st);
      if (st.measuredPosition !== undefined && Number.isFinite(st.measuredPosition)) {
        positionCm = teknicMeasuredToCm(st.measuredPosition);
        updateMotorPositionForLatch(positionCm);
      }
    } catch (e) {
      syncTravelLimitsFromMotorConnection(false);
      detail = friendlyMotorGrpcError(motor.motorConnectBaseUrl(), e);
    }

    try {
      const st = await sensor.getSensorStatus();
      sensorConnected = st.connected;
      ledOn = st.ledOn;
      leftPressed = st.limitLeftPressed;
      rightPressed = st.limitRightPressed;
      encoderTicks = st.encoderTicks;
      updateLimitSwitchState(st);
    } catch (e) {
      if (!detail) {
        detail = friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), e);
      }
    }

    const ticksPerRad = encoderTicksPerRadian();
    if (sensorConnected && ticksPerRad > 0) {
      angleDeg = (encoderTicks / ticksPerRad) * (180 / Math.PI);
    }

    const travelLimits = travelLimitsToCm(getTravelLimitDisplays());

    return {
      status: deriveMachineStatus(cartConnected, sensorConnected),
      connection: { cart: cartConnected, sensor: sensorConnected },
      cart: {
        positionCm,
        commandedCmPerSec,
        travelLimitsCm: {
          left: travelLimits.leftCm,
          right: travelLimits.rightCm,
        },
      },
      pendulum: { angleDeg, encoderTicks },
      led: { on: ledOn },
      limitSwitch: { leftPressed, rightPressed },
      error: detail,
    };
  }

  async connect(): Promise<ConnectResult> {
    return motor.connectMotor();
  }

  async disconnect(): Promise<void> {
    await motor.disconnectMotor();
  }

  async setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult> {
    if (isMotionBlockedByLatch()) {
      return { ok: false, error: motionLatchErrorMessage() };
    }
    const state = await this.getState();
    const rpm = cmPerSecToRpm(cmPerSec);
    const effective = clampJogRpmForTravelLimits(rpm, {
      connected: state.connection.sensor,
      limitLeftPressed: state.limitSwitch.leftPressed,
      limitRightPressed: state.limitSwitch.rightPressed,
    });
    if (rpm !== 0 && effective === 0) {
      return {
        ok: false,
        error: state.limitSwitch.leftPressed
          ? "Left travel limit is active — cannot jog further left."
          : "Right travel limit is active — cannot jog further right.",
      };
    }
    if (opts?.maxAccelerationRpmPerSec !== undefined) {
      return motor.setJogVelocityRpm(effective, opts);
    }
    return motor.setJogVelocityRpm(effective);
  }

  async stop(): Promise<CommandResult> {
    return motor.stopMotor();
  }

  async moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult> {
    if (!opts?.recovery && isMotionBlockedByLatch()) {
      return { ok: false, error: motionLatchErrorMessage() };
    }
    if (!opts?.recovery) {
      const state = await this.getState();
      const travelGuard = guardMoveAbsolutePositionCm(
        cm,
        {
          connected: state.connection.sensor,
          limitLeftPressed: state.limitSwitch.leftPressed,
          limitRightPressed: state.limitSwitch.rightPressed,
        },
        state.cart.positionCm ?? undefined,
      );
      if (travelGuard) return { ok: false, error: travelGuard };
    }
    return motor.moveToPosition(cmToTeknicMeasured(cm), {
      maxVelocityRpm: opts?.maxVelocityRpm,
      maxAccelerationRpmPerSec: opts?.maxAccelerationRpmPerSec,
    });
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    setTravelLimitsFromCm(limits);
    return { ok: true, error: "" };
  }

  async setLed(on: boolean): Promise<CommandResult> {
    try {
      const st = await sensor.getSensorStatus();
      if (!st.connected) {
        return { ok: false, error: "Sensor board is not connected." };
      }
      if (st.ledOn === on) {
        return { ok: true, error: "" };
      }
      return sensor.toggleLed();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function recordTravelLimitSideFromMotor(side: "left" | "right"): Promise<CommandResult> {
  return (async () => {
    const st = await motor.getMotorStatus();
    if (!st.connected) {
      return { ok: false, error: "Motor is not connected." };
    }
    const p = st.measuredPosition;
    if (p === undefined || !Number.isFinite(p)) {
      return {
        ok: false,
        error:
          "Motor measured position unavailable — rebuild motor DLL / physical-motor-service for PosnMeasured.",
      };
    }
    const { recordTravelLimitFromTeknicMeasured } = await import("../../railTravelLimits.js");
    recordTravelLimitFromTeknicMeasured(p, side);
    return { ok: true, error: "" };
  })();
}
