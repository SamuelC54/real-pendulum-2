export type ControlMode = "physical" | "simulation" | "twin";

export type CommandResult = { ok: boolean; error: string };

export type ConnectResult = CommandResult;

export type JogOptions = {
  maxAccelerationRpmPerSec?: number;
};

export type MoveOptions = {
  maxVelocityRpm?: number;
  maxAccelerationRpmPerSec?: number;
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
  getState(): Promise<MachineStateSources>;
  subscribeToState?(callback: (state: MachineStateSources) => void): Unsubscribe;

  connectMotor(): Promise<ConnectResult>;
  disconnectMotor(): Promise<void>;
  connectSensor(serialPort?: string): Promise<ConnectResult>;
  disconnectSensor(): Promise<ConnectResult>;
  connect(): Promise<ConnectResult>;
  disconnect(): Promise<void>;
  setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult>;
  stop(): Promise<CommandResult>;
  moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult>;
  setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult>;
  setLed(on: boolean): Promise<CommandResult>;
  zeroCartAtCurrent(): Promise<CommandResult>;
}
