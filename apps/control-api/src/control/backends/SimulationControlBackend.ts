import {
  physicsSimGetState,
  physicsSimHealthCheck,
  physicsSimMoveAbsolute,
  physicsSimStep,
} from "@real-pendulum/simulation/client";
import { isMotionBlocked, updateLimitSwitchState, updateMotorPosition } from "../../limitSwitchMode/index.js";
import { setTravelLimitsFromCm, syncTravelLimitsFromMotorConnection } from "../../railTravelLimits.js";
import { mpsFromCmPerSec } from "../motionUnits.js";
import {
  railStateFromPhysicsSim,
  setSimulationCartOffsetAtCurrent,
  setSimulationLedState,
  simulationCartOffsetM,
} from "../mappers/simulationMappers.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  MachineStateSources,
  RailMachineState,
  TravelLimitsCm,
} from "../types.js";

const SIM_DT_SEC = 0.02;

export class SimulationControlBackend implements ControlBackend {
  private async readRailState(): Promise<RailMachineState> {
    try {
      const reachable = await physicsSimHealthCheck();
      if (!reachable) {
        syncTravelLimitsFromMotorConnection(false, "simulation");
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
          { plantReachable: false },
        );
      }
      syncTravelLimitsFromMotorConnection(true, "simulation");
      const payload = await physicsSimGetState();
      const state = railStateFromPhysicsSim(payload, { plantReachable: true });
      if (isMotionBlocked()) {
        state.status = "latched";
      }
      updateMotorPosition(state.cart.positionCm ?? undefined, "simulation");
      updateLimitSwitchState({
        connected: state.connection.sensor,
        limitLeftPressed: state.limitSwitch.leftPressed,
        limitRightPressed: state.limitSwitch.rightPressed,
      });
      return state;
    } catch (e) {
      syncTravelLimitsFromMotorConnection(false, "simulation");
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

  async connectMotor(): Promise<ConnectResult> {
    const ok = await physicsSimHealthCheck();
    return ok ? { ok: true, error: "" } : { ok: false, error: "simulation is not reachable." };
  }

  async disconnectMotor(): Promise<void> {
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdMps: 0 });
    } catch {
      /* plant may already be down */
    }
  }

  async connectSensor(): Promise<ConnectResult> {
    return this.connectMotor();
  }

  async disconnectSensor(): Promise<ConnectResult> {
    await this.disconnectMotor();
    return { ok: true, error: "" };
  }

  async connect(): Promise<ConnectResult> {
    return this.connectMotor();
  }

  async disconnect(): Promise<void> {
    await this.disconnectMotor();
  }

  async setJogCmPerSec(cmPerSec: number, _opts?: JogOptions): Promise<CommandResult> {
    if (isMotionBlocked()) {
      return { ok: false, error: "Motion latch is engaged." };
    }
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdMps: mpsFromCmPerSec(cmPerSec) });
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async stop(): Promise<CommandResult> {
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdMps: 0 });
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult> {
    if (isMotionBlocked() && !opts?.recovery) {
      return { ok: false, error: "Motion latch is engaged." };
    }
    try {
      const xM = cm / 100 + simulationCartOffsetM();
      const maxVelocityMps =
        opts?.maxVelocityRpm != null ? (opts.maxVelocityRpm * 0.0007) : undefined;
      await physicsSimMoveAbsolute({
        xM,
        maxVelocityMps,
        toleranceM: 0.002,
      });
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    setTravelLimitsFromCm(limits, "simulation");
    return { ok: true, error: "" };
  }

  async setLed(on: boolean): Promise<CommandResult> {
    setSimulationLedState(on);
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent(): Promise<CommandResult> {
    const reachable = await physicsSimHealthCheck();
    if (!reachable) {
      return { ok: false, error: "simulation is not reachable." };
    }
    try {
      const payload = await physicsSimGetState();
      setSimulationCartOffsetAtCurrent(payload.state.xM);
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
