import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import {
  isMotionBlocked,
  limitSwitchModeErrorMessage,
} from "../../../limitSwitchMode/index.js";
import { friendlySensorGrpcError } from "../../../helpers/physical/sensorErrors.js";
import { cmToTeknicMeasured } from "../../../railPositionCm.js";
import {
  clampJogCmPerSecForTravelLimits,
  guardMoveAbsolutePositionCm,
} from "../../../railLimitGuards.js";
import { recordTravelLimitSide, setSymmetricTravelSpan } from "../../travelLimitsActions.js";
import { TravelLimitsStore } from "../../travelLimitsStore.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  MachineStateSources,
  TravelLimitsCm,
  Unsubscribe,
} from "../../types.js";
import type { SymmetricTravelLimitsCm } from "../../travelLimitsStore.js";
import {
  buildPhysicalRailState,
  fetchPhysicalRailState,
  type PhysicalMotorSnapshot,
  type PhysicalSensorSnapshot,
} from "./physicalRailState.js";

/**
 * Physical plant — {@link subscribeToState} merges live gRPC
 * `MotorService.SubscribeStatus` + `SensorService.SubscribeStatus` streams.
 */
export class PhysicalControlBackend implements ControlBackend {
  readonly mode = "physical" as const;

  readonly travelLimits = new TravelLimitsStore();

  private motorSnap: PhysicalMotorSnapshot | null = null;
  private sensorSnap: PhysicalSensorSnapshot | null = null;
  private readonly listeners = new Set<(state: MachineStateSources) => void>();
  private grpcStreamRefs = 0;
  private stopGrpcStreams: (() => void) | null = null;

  /** @internal Vitest */
  resetTravelLimitsForTests(): void {
    this.travelLimits.clear();
  }

  getTravelLimits(): TravelLimitsCm {
    return this.travelLimits.getTravelLimitsCm();
  }

  private emitFromGrpcCache(): void {
    if (this.listeners.size === 0) return;
    const physical = buildPhysicalRailState(
      this.motorSnap,
      this.sensorSnap,
      this.travelLimits.getTravelLimitsCm(),
    );
    const payload: MachineStateSources = { physical };
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  private startGrpcStreams(): void {
    if (this.stopGrpcStreams) return;

    this.stopGrpcStreams = () => {
      stopMotor();
      stopSensor();
      this.stopGrpcStreams = null;
    };

    const stopMotor = motor.subscribeMotorStatus((st) => {
      this.motorSnap = st;
      this.travelLimits.syncFromMotorConnection(st.connected);
      this.emitFromGrpcCache();
    });

    const stopSensor = sensor.subscribeSensorStatus((st) => {
      this.sensorSnap = st;
      this.emitFromGrpcCache();
    });
  }

  private stopGrpcStreamsIfIdle(): void {
    if (this.grpcStreamRefs > 0) return;
    this.stopGrpcStreams?.();
    this.motorSnap = null;
    this.sensorSnap = null;
  }

  async getState(): Promise<MachineStateSources> {
    if (this.motorSnap) {
      this.travelLimits.syncFromMotorConnection(this.motorSnap.connected);
    } else {
      try {
        const st = await motor.getMotorStatus();
        this.travelLimits.syncFromMotorConnection(st.connected);
      } catch {
        this.travelLimits.syncFromMotorConnection(false);
      }
    }
    return {
      physical: await fetchPhysicalRailState(this.travelLimits.getTravelLimitsCm()),
    };
  }

  subscribeToState(callback: (state: MachineStateSources) => void): Unsubscribe {
    this.listeners.add(callback);
    this.grpcStreamRefs += 1;

    if (this.grpcStreamRefs === 1) {
      this.startGrpcStreams();
      void this.getState().then(callback);
    } else {
      this.emitFromGrpcCache();
      if (!this.motorSnap && !this.sensorSnap) {
        void this.getState().then(callback);
      }
    }

    return () => {
      this.listeners.delete(callback);
      this.grpcStreamRefs -= 1;
      this.stopGrpcStreamsIfIdle();
    };
  }

  async connectMotor(): Promise<ConnectResult> {
    return motor.connectMotor();
  }

  async disconnectMotor(): Promise<void> {
    await motor.disconnectMotor();
    this.travelLimits.syncFromMotorConnection(false);
    this.emitFromGrpcCache();
  }

  async connectSensor(serialPort?: string): Promise<ConnectResult> {
    try {
      return await sensor.connectSensor(serialPort);
    } catch (e) {
      return { ok: false, error: friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), e) };
    }
  }

  async disconnectSensor(): Promise<ConnectResult> {
    try {
      return await sensor.disconnectSensor();
    } catch (e) {
      return { ok: false, error: friendlySensorGrpcError(sensor.sensorConnectBaseUrl(), e) };
    }
  }

  private railStateFromCache() {
    return buildPhysicalRailState(
      this.motorSnap,
      this.sensorSnap,
      this.travelLimits.getTravelLimitsCm(),
    );
  }

  private async railStateForCommands() {
    if (this.motorSnap !== null || this.sensorSnap !== null) {
      return this.railStateFromCache();
    }
    return fetchPhysicalRailState(this.travelLimits.getTravelLimitsCm());
  }

  async setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult> {
    if (isMotionBlocked()) {
      return { ok: false, error: limitSwitchModeErrorMessage() };
    }
    const state = await this.railStateForCommands();
    const effective = clampJogCmPerSecForTravelLimits(cmPerSec, {
      connected: state.connection.sensor,
      limitLeftPressed: state.limitSwitch.leftPressed,
      limitRightPressed: state.limitSwitch.rightPressed,
    });
    if (cmPerSec !== 0 && effective === 0) {
      return {
        ok: false,
        error: state.limitSwitch.leftPressed
          ? "Left travel limit is active — cannot jog further left."
          : "Right travel limit is active — cannot jog further right.",
      };
    }
    return motor.setJogVelocityCmPerSec(effective, opts);
  }

  async stop(): Promise<CommandResult> {
    return motor.stopMotor();
  }

  async moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult> {
    if (!opts?.recovery && isMotionBlocked()) {
      return { ok: false, error: limitSwitchModeErrorMessage() };
    }
    if (!opts?.recovery) {
      const state = await this.railStateForCommands();
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
      maxVelocityCmPerSec: opts?.maxVelocityCmPerSec,
      maxAccelerationCmPerSec2: opts?.maxAccelerationCmPerSec2,
    });
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    this.travelLimits.setFromCm(limits);
    this.emitFromGrpcCache();
    return { ok: true, error: "" };
  }

  async recordTravelLimitSide(side: "left" | "right"): Promise<CommandResult> {
    return recordTravelLimitSide(
      this.travelLimits,
      () => this.getState(),
      "physical",
      side,
      () => this.emitFromGrpcCache(),
    );
  }

  async setSymmetricTravelSpan(
    halfSpanCm: number,
  ): Promise<CommandResult & SymmetricTravelLimitsCm> {
    return setSymmetricTravelSpan(
      this.travelLimits,
      () => this.getState(),
      "physical",
      halfSpanCm,
      () => this.emitFromGrpcCache(),
    );
  }

  applyHomingTravelLimits(
    posAtLeftMotor: number,
    posAtRightMotor: number,
    zeroedAtMid: boolean,
  ): void {
    this.travelLimits.setFromHoming(posAtLeftMotor, posAtRightMotor, zeroedAtMid);
    this.emitFromGrpcCache();
  }

  async setLed(on: boolean): Promise<CommandResult> {
    try {
      const st = this.sensorSnap ?? (await sensor.getSensorStatus());
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

  async zeroCartAtCurrent(): Promise<CommandResult> {
    const st = this.motorSnap ?? (await motor.getMotorStatus());
    if (!st.connected) {
      return { ok: false, error: "Motor is not connected." };
    }
    return motor.zeroMeasuredPosition();
  }
}
