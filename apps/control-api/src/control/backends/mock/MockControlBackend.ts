import type { SymmetricTravelLimitsCm } from "../../travelLimitsStore.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MachineStateSources,
  MoveOptions,
  RailMachineState,
  TravelLimitsCm,
  Unsubscribe,
} from "../../types.js";

/** In-memory backend for unit tests. */
export class MockControlBackend implements ControlBackend {
  readonly mode = "physical" as const;

  private readonly listeners = new Set<(state: MachineStateSources) => void>();

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

  private emit(): void {
    const state: MachineStateSources = { physical: structuredClone(this.state) };
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  async getState(): Promise<MachineStateSources> {
    return { physical: structuredClone(this.state) };
  }

  subscribeToState(callback: (state: MachineStateSources) => void): Unsubscribe {
    this.listeners.add(callback);
    callback({ physical: structuredClone(this.state) });
    return () => {
      this.listeners.delete(callback);
    };
  }

  async connectMotor(): Promise<ConnectResult> {
    this.state.connection.cart = true;
    this.emit();
    return { ok: true, error: "" };
  }

  async disconnectMotor(): Promise<void> {
    this.state.connection.cart = false;
    if (!this.state.connection.sensor) {
      this.state.status = "disconnected";
    }
    this.emit();
  }

  async connectSensor(_serialPort?: string): Promise<ConnectResult> {
    this.state.connection.sensor = true;
    this.emit();
    return { ok: true, error: "" };
  }

  async disconnectSensor(): Promise<CommandResult> {
    this.state.connection.sensor = false;
    if (!this.state.connection.cart) {
      this.state.status = "disconnected";
    }
    this.emit();
    return { ok: true, error: "" };
  }

  async setJogCmPerSec(cmPerSec: number, _opts?: JogOptions): Promise<CommandResult> {
    this.state.cart.commandedCmPerSec = cmPerSec;
    this.emit();
    return { ok: true, error: "" };
  }

  async stop(): Promise<CommandResult> {
    this.state.cart.commandedCmPerSec = 0;
    this.emit();
    return { ok: true, error: "" };
  }

  async moveToPositionCm(cm: number, _opts?: MoveOptions): Promise<CommandResult> {
    this.state.cart.positionCm = cm;
    this.emit();
    return { ok: true, error: "" };
  }

  getTravelLimits(): TravelLimitsCm {
    return { ...this.state.cart.travelLimitsCm };
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    this.state.cart.travelLimitsCm = { ...limits };
    this.emit();
    return { ok: true, error: "" };
  }

  async recordTravelLimitSide(side: "left" | "right"): Promise<CommandResult> {
    if (!this.state.connection.cart) {
      return { ok: false, error: "Motor is not connected." };
    }
    if (this.state.cart.positionCm == null) {
      return { ok: false, error: "Cart position unavailable." };
    }
    const limits: TravelLimitsCm = {
      left: side === "left" ? this.state.cart.positionCm : this.state.cart.travelLimitsCm.left,
      right: side === "right" ? this.state.cart.positionCm : this.state.cart.travelLimitsCm.right,
    };
    return this.setTravelLimits(limits);
  }

  async setSymmetricTravelSpan(
    halfSpanCm: number,
  ): Promise<CommandResult & SymmetricTravelLimitsCm> {
    if (this.state.cart.positionCm == null) {
      throw new Error("Motor position unavailable.");
    }
    const centerCm = this.state.cart.positionCm;
    const leftCm = centerCm - halfSpanCm;
    const rightCm = centerCm + halfSpanCm;
    const r = await this.setTravelLimits({ left: leftCm, right: rightCm });
    if (!r.ok) return r;
    return { ...r, centerCm, halfSpanCm, leftCm, rightCm };
  }

  applyHomingTravelLimits(
    posAtLeftMotor: number,
    posAtRightMotor: number,
    zeroedAtMid: boolean,
  ): void {
    if (!Number.isFinite(posAtLeftMotor) || !Number.isFinite(posAtRightMotor)) return;
    if (zeroedAtMid) {
      const mid = (posAtLeftMotor + posAtRightMotor) / 2;
      void this.setTravelLimits({
        left: mid - posAtLeftMotor,
        right: mid - posAtRightMotor,
      });
      return;
    }
    void this.setTravelLimits({ left: -posAtLeftMotor, right: -posAtRightMotor });
  }

  async setLed(on: boolean): Promise<CommandResult> {
    this.state.led.on = on;
    this.emit();
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent(): Promise<CommandResult> {
    if (!this.state.connection.cart) {
      return { ok: false, error: "Motor is not connected." };
    }
    this.state.cart.positionCm = 0;
    this.emit();
    return { ok: true, error: "" };
  }
}
