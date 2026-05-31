import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MachineStateSources,
  MoveOptions,
  RailMachineState,
  TravelLimitsCm,
} from "../types.js";

/** In-memory backend for unit tests. */
export class MockControlBackend implements ControlBackend {
  state: RailMachineState = {
    status: "idle",
    connection: { cart: true, sensor: true },
    cart: {
      positionCm: 0,
      commandedCmPerSec: 0,
      travelLimitsCm: { left: null, right: null },
    },
    pendulum: { angleDeg: 0, encoderTicks: 0 },
    led: { on: false },
    limitSwitch: { leftPressed: false, rightPressed: false },
  };

  async getState(): Promise<MachineStateSources> {
    return { physical: structuredClone(this.state) };
  }

  async connectMotor(): Promise<ConnectResult> {
    this.state.connection.cart = true;
    return { ok: true, error: "" };
  }

  async disconnectMotor(): Promise<void> {
    this.state.connection.cart = false;
    if (!this.state.connection.sensor) {
      this.state.status = "disconnected";
    }
  }

  async connectSensor(_serialPort?: string): Promise<ConnectResult> {
    this.state.connection.sensor = true;
    return { ok: true, error: "" };
  }

  async disconnectSensor(): Promise<CommandResult> {
    this.state.connection.sensor = false;
    if (!this.state.connection.cart) {
      this.state.status = "disconnected";
    }
    return { ok: true, error: "" };
  }

  async setJogCmPerSec(cmPerSec: number, _opts?: JogOptions): Promise<CommandResult> {
    this.state.cart.commandedCmPerSec = cmPerSec;
    return { ok: true, error: "" };
  }

  async stop(): Promise<CommandResult> {
    this.state.cart.commandedCmPerSec = 0;
    return { ok: true, error: "" };
  }

  async moveToPositionCm(cm: number, _opts?: MoveOptions): Promise<CommandResult> {
    this.state.cart.positionCm = cm;
    return { ok: true, error: "" };
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    this.state.cart.travelLimitsCm = { ...limits };
    return { ok: true, error: "" };
  }

  async setLed(on: boolean): Promise<CommandResult> {
    this.state.led.on = on;
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent(): Promise<CommandResult> {
    if (!this.state.connection.cart) {
      return { ok: false, error: "Motor is not connected." };
    }
    this.state.cart.positionCm = 0;
    return { ok: true, error: "" };
  }
}
