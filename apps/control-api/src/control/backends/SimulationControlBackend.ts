import {
  physicsSimGetState,
  physicsSimHealthCheck,
  physicsSimMoveAbsolute,
  physicsSimStep,
} from "@real-pendulum/physics-sim/client";
import { isMotionBlockedByLatch } from "../../motionLatch.js";
import { setTravelLimitsFromCm, syncTravelLimitsFromMotorConnection } from "../../railTravelLimits.js";
import { mpsFromCmPerSec } from "../motionUnits.js";
import {
  railStateFromPhysicsSim,
  setSimulationLedState,
} from "../mappers/simulationMappers.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  RailMachineState,
  TravelLimitsCm,
} from "../types.js";

const SIM_DT_SEC = 0.02;

export class SimulationControlBackend implements ControlBackend {
  private plantConnected = false;

  async getState(): Promise<RailMachineState> {
    try {
      const reachable = await physicsSimHealthCheck();
      if (!reachable) {
        this.plantConnected = false;
        syncTravelLimitsFromMotorConnection(false);
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
              angularDampingPerSec: 0,
              encoderTicksPerRadian: 1,
              maxInternalStepSec: 0.01,
            },
          },
          { plantReachable: false },
        );
      }
      this.plantConnected = true;
      syncTravelLimitsFromMotorConnection(true);
      const payload = await physicsSimGetState();
      const state = railStateFromPhysicsSim(payload, { plantReachable: true });
      if (isMotionBlockedByLatch()) {
        state.status = "latched";
      }
      return state;
    } catch (e) {
      this.plantConnected = false;
      syncTravelLimitsFromMotorConnection(false);
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
            angularDampingPerSec: 0,
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

  async connect(): Promise<ConnectResult> {
    const ok = await physicsSimHealthCheck();
    this.plantConnected = ok;
    return ok ? { ok: true, error: "" } : { ok: false, error: "physics-sim is not reachable." };
  }

  async disconnect(): Promise<void> {
    this.plantConnected = false;
    try {
      await physicsSimStep({ dt: SIM_DT_SEC, vCmdMps: 0 });
    } catch {
      /* plant may already be down */
    }
  }

  async setJogCmPerSec(cmPerSec: number, _opts?: JogOptions): Promise<CommandResult> {
    if (isMotionBlockedByLatch()) {
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
    if (isMotionBlockedByLatch() && !opts?.recovery) {
      return { ok: false, error: "Motion latch is engaged." };
    }
    try {
      const xM = cm / 100;
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
    setTravelLimitsFromCm(limits);
    return { ok: true, error: "" };
  }

  async setLed(on: boolean): Promise<CommandResult> {
    setSimulationLedState(on);
    return { ok: true, error: "" };
  }
}
