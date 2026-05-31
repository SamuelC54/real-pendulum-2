import type { RailMachineState, TravelLimitsCm } from "../types.js";

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

  async getState(): Promise<RailMachineState> {
    return structuredClone(this.state);
  }

  async connect() {
    this.state.connection.cart = true;
    return { ok: true, error: "" };
  }

  async disconnect(): Promise<void> {
    this.state.connection.cart = false;
    this.state.connection.sensor = false;
    this.state.status = "disconnected";
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
}
