import {
  physicsSimGetState,
  physicsSimHealthCheck,
  physicsSimMoveAbsolute,
  physicsSimStep,
} from "@real-pendulum/simulation/client";
import {
  isMotionBlocked,
  updateLimitSwitchState,
  updateMotorPosition,
} from "../../../limitSwitchMode/index.js";
import { recordTravelLimitSide, setSymmetricTravelSpan } from "../../travelLimitsActions.js";
import { TravelLimitsStore } from "../../travelLimitsStore.js";
import { physicsStateToCm } from "@real-pendulum/simulation/client";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  MachineStateSources,
  RailMachineState,
  TravelLimitsCm,
  Unsubscribe,
} from "../../types.js";
import type { SymmetricTravelLimitsCm } from "../../travelLimitsStore.js";
import {
  railStateFromPhysicsSim,
  setSimulationCartOffsetAtCurrent,
  setSimulationLedState,
  simulationCartOffsetCm,
} from "./simulationMappers.js";

const SIM_DT_SEC = 0.02;
/** Wall-clock jog tick — physics must advance between jog RPCs, not only on each set. */
const JOG_TICK_MS = 50;

export class SimulationControlBackend implements ControlBackend {
  readonly mode = "simulation" as const;

  readonly travelLimits = new TravelLimitsStore();
  private readonly listeners = new Set<(state: MachineStateSources) => void>();
  private jogCmPerSec = 0;
  private jogTimer: ReturnType<typeof setInterval> | null = null;
  private jogStepInFlight = false;

  /** @internal Vitest */
  resetTravelLimitsForTests(): void {
    this.travelLimits.clear();
  }

  getTravelLimits(): TravelLimitsCm {
    return this.travelLimits.getTravelLimitsCm();
  }

  private async emit(): Promise<void> {
    if (this.listeners.size === 0) return;
    const state = await this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private stopJogLoop(): void {
    this.jogCmPerSec = 0;
    if (this.jogTimer != null) {
      clearInterval(this.jogTimer);
      this.jogTimer = null;
    }
  }

  private startJogLoop(cmPerSec: number): void {
    this.jogCmPerSec = cmPerSec;
    if (this.jogTimer != null) return;
    this.jogTimer = setInterval(() => void this.runJogStep(), JOG_TICK_MS);
  }

  private async runJogStep(): Promise<boolean> {
    if (this.jogCmPerSec === 0 || this.jogStepInFlight) return true;
    if (isMotionBlocked()) {
      this.stopJogLoop();
      try {
        await physicsSimStep({ dt: SIM_DT_SEC, vCmdCmPerSec: 0 });
        await this.emit();
      } catch {
        /* plant down */
      }
      return false;
    }
    this.jogStepInFlight = true;
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdCmPerSec: this.jogCmPerSec });
      await this.emit();
      return true;
    } catch {
      this.stopJogLoop();
      return false;
    } finally {
      this.jogStepInFlight = false;
    }
  }

  private async readRailState(): Promise<RailMachineState> {
    try {
      const reachable = await physicsSimHealthCheck();
      if (!reachable) {
        this.travelLimits.syncFromMotorConnection(false);
        return railStateFromPhysicsSim(
          {
            state: {
              xM: 0,
              vMps: 0,
              thetaRad: 0,
              omegaRps: 0,
              vCmdMps: 0,
              encoderTicksFloat: 0,
              limitLeftPressed: false,
              limitRightPressed: false,
            },
            config: {
              gravity: 9.80665,
              pendulumLengthM: 0.3,
              cartVelocityTrackingPerSec: 10,
              angularDampingPerSec: 0.00003,
              encoderTicksPerRadian: 1,
              maxInternalStepSec: 0.01,
            },
          },
          this.travelLimits.getTravelLimitsCm(),
          { plantReachable: false },
        );
      }
      this.travelLimits.syncFromMotorConnection(true);
      const payload = await physicsSimGetState();
      const state = railStateFromPhysicsSim(
        payload,
        this.travelLimits.getTravelLimitsCm(),
        { plantReachable: true },
      );
      if (isMotionBlocked()) {
        state.status = "latched";
      }
      updateMotorPosition(state.cart.positionCm ?? undefined, state.cart.travelLimitsCm);
      updateLimitSwitchState({
        connected: state.connection.sensor,
        limitLeftPressed: state.limitSwitch.leftPressed,
        limitRightPressed: state.limitSwitch.rightPressed,
      });
      return state;
    } catch (e) {
      this.travelLimits.syncFromMotorConnection(false);
      const msg = e instanceof Error ? e.message : String(e);
      const state = railStateFromPhysicsSim(
        {
          state: {
            xM: 0,
            vMps: 0,
            thetaRad: 0,
            omegaRps: 0,
            vCmdMps: 0,
            encoderTicksFloat: 0,
          },
          config: {
            gravity: 9.80665,
            pendulumLengthM: 0.3,
            cartVelocityTrackingPerSec: 10,
            angularDampingPerSec: 0.00003,
            encoderTicksPerRadian: 1,
            maxInternalStepSec: 0.01,
          },
        },
        this.travelLimits.getTravelLimitsCm(),
        { plantReachable: false },
      );
      state.error = msg;
      state.status = "error";
      return state;
    }
  }

  async getState(): Promise<MachineStateSources> {
    return { simulation: await this.readRailState() };
  }

  subscribeToState(callback: (state: MachineStateSources) => void): Unsubscribe {
    this.listeners.add(callback);
    void this.getState().then(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  async connectMotor(): Promise<ConnectResult> {
    const ok = await physicsSimHealthCheck();
    const r = ok ? { ok: true, error: "" } : { ok: false, error: "simulation is not reachable." };
    await this.emit();
    return r;
  }

  async disconnectMotor(): Promise<void> {
    this.stopJogLoop();
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdCmPerSec: 0 });
    } catch {
      /* plant may already be down */
    }
    this.travelLimits.syncFromMotorConnection(false);
    await this.emit();
  }

  async connectSensor(): Promise<ConnectResult> {
    return this.connectMotor();
  }

  async disconnectSensor(): Promise<ConnectResult> {
    await this.disconnectMotor();
    return { ok: true, error: "" };
  }

  async setJogCmPerSec(cmPerSec: number, _opts?: JogOptions): Promise<CommandResult> {
    if (isMotionBlocked()) {
      return { ok: false, error: "Motion latch is engaged." };
    }
    if (cmPerSec === 0) {
      return this.stop();
    }
    this.startJogLoop(cmPerSec);
    const stepped = await this.runJogStep();
    if (!stepped) {
      return { ok: false, error: "Simulation jog step failed." };
    }
    return { ok: true, error: "" };
  }

  async stop(): Promise<CommandResult> {
    this.stopJogLoop();
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdCmPerSec: 0 });
      await this.emit();
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult> {
    if (isMotionBlocked() && !opts?.recovery) {
      return { ok: false, error: "Motion latch is engaged." };
    }
    this.stopJogLoop();
    try {
      await physicsSimMoveAbsolute({
        xCm: cm + simulationCartOffsetCm(),
        maxVelocityCmPerSec: opts?.maxVelocityCmPerSec,
        toleranceCm: 0.2,
      });
      await this.emit();
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    this.travelLimits.setFromCm(limits);
    await this.emit();
    return { ok: true, error: "" };
  }

  async recordTravelLimitSide(side: "left" | "right"): Promise<CommandResult> {
    return recordTravelLimitSide(
      this.travelLimits,
      () => this.getState(),
      "simulation",
      side,
      () => void this.emit(),
    );
  }

  async setSymmetricTravelSpan(
    halfSpanCm: number,
  ): Promise<CommandResult & SymmetricTravelLimitsCm> {
    return setSymmetricTravelSpan(
      this.travelLimits,
      () => this.getState(),
      "simulation",
      halfSpanCm,
      () => void this.emit(),
    );
  }

  applyHomingTravelLimits(
    posAtLeftMotor: number,
    posAtRightMotor: number,
    zeroedAtMid: boolean,
  ): void {
    this.travelLimits.setFromHoming(posAtLeftMotor, posAtRightMotor, zeroedAtMid);
    void this.emit();
  }

  async setLed(on: boolean): Promise<CommandResult> {
    setSimulationLedState(on);
    await this.emit();
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent(): Promise<CommandResult> {
    const reachable = await physicsSimHealthCheck();
    if (!reachable) {
      return { ok: false, error: "simulation is not reachable." };
    }
    try {
      const payload = await physicsSimGetState();
      setSimulationCartOffsetAtCurrent(physicsStateToCm(payload.state).xCm);
      await this.emit();
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
