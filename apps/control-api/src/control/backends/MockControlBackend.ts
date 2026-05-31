import type { RailMachineState, MachineStateSources, TravelLimitsCm } from "../types.js";

/** In-memory backend for unit tests. */
export class MockControlBackend {
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

  async connectMotor() {
    this.state.connection.cart = true;
    return { ok: true, error: "" };
  }

  async disconnectMotor(): Promise<void> {
    this.state.connection.cart = false;
    if (!this.state.connection.sensor) {
      this.state.status = "disconnected";
    }
  }

  async connectSensor() {
    this.state.connection.sensor = true;
    return { ok: true, error: "" };
  }

  async disconnectSensor() {
    this.state.connection.sensor = false;
    if (!this.state.connection.cart) {
      this.state.status = "disconnected";
    }
    return { ok: true, error: "" };
  }

  async connect() {
    return this.connectMotor();
  }

  async disconnect(): Promise<void> {
    await this.disconnectMotor();
    await this.disconnectSensor();
  }

  async setJogCmPerSec(cmPerSec: number) {
    this.state.cart.commandedCmPerSec = cmPerSec;
    return { ok: true, error: "" };
  }

  async stop() {
    this.state.cart.commandedCmPerSec = 0;
    return { ok: true, error: "" };
  }

  async moveToPositionCm(cm: number) {
    this.state.cart.positionCm = cm;
    return { ok: true, error: "" };
  }

  async setTravelLimits(limits: TravelLimitsCm) {
    this.state.cart.travelLimitsCm = { ...limits };
    return { ok: true, error: "" };
  }

  async setLed(on: boolean) {
    this.state.led.on = on;
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent() {
    if (!this.state.connection.cart) {
      return { ok: false, error: "Motor is not connected." };
    }
    this.state.cart.positionCm = 0;
    return { ok: true, error: "" };
  }
}
