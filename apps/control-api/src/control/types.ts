export type ControlMode = "hardware" | "sim" | "twin";

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

export type Unsubscribe = () => void;

export interface ControlBackend {
  getState(): Promise<RailMachineState>;
  subscribeToState?(callback: (state: RailMachineState) => void): Unsubscribe;

  connect(): Promise<ConnectResult>;
  disconnect(): Promise<void>;
  setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult>;
  stop(): Promise<CommandResult>;
  moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult>;
  setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult>;
  setLed(on: boolean): Promise<CommandResult>;
}
