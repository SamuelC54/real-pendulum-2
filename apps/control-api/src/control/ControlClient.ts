import type { ControlBackend, ControlMode, JogOptions, MoveOptions, MachineStateSources, TravelLimitsCm } from "./types.js";

export type ControlClientOptions = {
  backend: ControlBackend;
  mode: ControlMode;
};

export class ControlClient {
  readonly mode: ControlMode;

  constructor(private readonly options: ControlClientOptions) {
    this.mode = options.mode;
  }

  getState(): Promise<MachineStateSources> {
    return this.options.backend.getState();
  }

  connectMotor() {
    return this.options.backend.connectMotor();
  }

  disconnectMotor() {
    return this.options.backend.disconnectMotor();
  }

  connectSensor(serialPort?: string) {
    return this.options.backend.connectSensor(serialPort);
  }

  disconnectSensor() {
    return this.options.backend.disconnectSensor();
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

  zeroCartAtCurrent() {
    return this.options.backend.zeroCartAtCurrent();
  }
}
