import type { ControlBackend, JogOptions, MoveOptions, TravelLimitsCm } from "./types.js";

export type ControlClientOptions = {
  backend: ControlBackend;
};

export class ControlClient {
  constructor(private readonly options: ControlClientOptions) {}

  getState() {
    return this.options.backend.getState();
  }

  connect() {
    return this.options.backend.connect();
  }

  disconnect() {
    return this.options.backend.disconnect();
  }

  setJogCmPerSec(cmPerSec: number, opts?: JogOptions) {
    return this.options.backend.setJogCmPerSec(cmPerSec, opts);
  }

  stop() {
    return this.options.backend.stop();
  }

  moveToPositionCm(cm: number, opts?: MoveOptions) {
    return this.options.backend.moveToPositionCm(cm, opts);
  }

  setTravelLimits(limits: TravelLimitsCm) {
    return this.options.backend.setTravelLimits(limits);
  }

  setLed(on: boolean) {
    return this.options.backend.setLed(on);
  }
}
