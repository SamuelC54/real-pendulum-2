import type { SymmetricTravelLimitsCm } from "./travelLimitsStore.js";

export type ControlMode = "physical" | "simulation" | "twin";

export type CommandResult = { ok: boolean; error: string };

export type ConnectResult = CommandResult;

export type JogOptions = {
  maxAccelerationCmPerSec2?: number;
};

export type MoveOptions = {
  maxVelocityCmPerSec?: number;
  maxAccelerationCmPerSec2?: number;
  recovery?: boolean;
};

export type TravelLimitsCm = {
  left: number | null;
  right: number | null;
};

export type RailMachineState = {
  status: "idle" | "moving" | "latched" | "error" | "disconnected";
  connection: {
    cart: boolean;
    sensor: boolean;
  };
  cart: {
    positionCm: number | null;
    commandedCmPerSec: number;
    travelLimitsCm: TravelLimitsCm;
  };
  pendulum: {
    angleDeg: number;
    encoderTicks: number;
  };
  led: {
    on: boolean;
  };
  limitSwitch: {
    leftPressed: boolean;
    rightPressed: boolean;
  };
  error?: string;
};

export type MachineSourceId = "physical" | "simulation";

export type MachineStateSources = Partial<Record<MachineSourceId, RailMachineState>>;

export function railStateForMode(
  sources: MachineStateSources,
  mode: ControlMode,
): RailMachineState {
  const state =
    mode === "simulation" ? sources.simulation : sources.physical;
  if (!state) {
    throw new Error("Machine state unavailable for active backend.");
  }
  return state;
}

export type Unsubscribe = () => void;

export interface ControlBackend {
  readonly mode: ControlMode;

  getState(): Promise<MachineStateSources>;
  subscribeToState(callback: (state: MachineStateSources) => void): Unsubscribe;

  getTravelLimits(): TravelLimitsCm;

  connectMotor(): Promise<ConnectResult>;
  disconnectMotor(): Promise<void>;
  connectSensor(serialPort?: string): Promise<ConnectResult>;
  disconnectSensor(): Promise<ConnectResult>;
  setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult>;
  stop(): Promise<CommandResult>;
  moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult>;
  setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult>;
  recordTravelLimitSide(side: "left" | "right"): Promise<CommandResult>;
  setSymmetricTravelSpan(halfSpanCm: number): Promise<CommandResult & SymmetricTravelLimitsCm>;
  applyHomingTravelLimits(
    posAtLeftMotor: number,
    posAtRightMotor: number,
    zeroedAtMid: boolean,
  ): void;
  setLed(on: boolean): Promise<CommandResult>;
  zeroCartAtCurrent(): Promise<CommandResult>;
}
