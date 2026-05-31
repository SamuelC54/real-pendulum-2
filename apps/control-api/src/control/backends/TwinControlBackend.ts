import { withControlBackend } from "../../helpers/backendContext.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  RailMachineState,
  MachineStateSources,
  TravelLimitsCm,
} from "../types.js";

export type TwinWireResult<T> = { real: T; sim: T };

async function twinRun<T>(
  physical: ControlBackend,
  simulation: ControlBackend,
  fn: (b: ControlBackend) => Promise<T>,
): Promise<TwinWireResult<T>> {
  const [real, sim] = await Promise.all([
    withControlBackend("physical", () => fn(physical)),
    withControlBackend("simulation", () => fn(simulation)),
  ]);
  return { real, sim };
}

export class TwinControlBackend implements ControlBackend {
  constructor(
    readonly physical: ControlBackend,
    readonly simulation: ControlBackend,
  ) {}

  async getState(): Promise<MachineStateSources> {
    const [physical, simulation] = await Promise.all([
      withControlBackend("physical", async () => (await this.physical.getState()).physical!),
      withControlBackend("simulation", async () => (await this.simulation.getState()).simulation!),
    ]);
    return { physical, simulation };
  }

  async getPhysicalState(): Promise<RailMachineState> {
    return withControlBackend("physical", async () => (await this.physical.getState()).physical!);
  }

  async getSimulationState(): Promise<RailMachineState> {
    return withControlBackend("simulation", async () => (await this.simulation.getState()).simulation!);
  }

  async connectTwin(): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.connect());
  }

  async connectMotorTwin(): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.connectMotor());
  }

  async disconnectMotorTwin(): Promise<TwinWireResult<void>> {
    return twinRun(this.physical, this.simulation, (b) => b.disconnectMotor());
  }

  async connectSensorTwin(serialPort?: string): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.connectSensor(serialPort));
  }

  async disconnectSensorTwin(): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.disconnectSensor());
  }

  async disconnectTwin(): Promise<TwinWireResult<void>> {
    return twinRun(this.physical, this.simulation, (b) => b.disconnect());
  }

  async setJogCmPerSecTwin(
    cmPerSec: number,
    opts?: JogOptions,
  ): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.setJogCmPerSec(cmPerSec, opts));
  }

  async stopTwin(): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.stop());
  }

  async moveToPositionCmTwin(
    cm: number,
    opts?: MoveOptions,
  ): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.moveToPositionCm(cm, opts));
  }

  async setTravelLimitsTwin(limits: TravelLimitsCm): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.setTravelLimits(limits));
  }

  async setLedTwin(on: boolean): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.setLed(on));
  }

  async zeroCartAtCurrentTwin(): Promise<TwinWireResult<CommandResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.zeroCartAtCurrent());
  }

  // ControlBackend — composite (both must succeed for merged ok)
  async connectMotor(): Promise<ConnectResult> {
    const { real, sim } = await this.connectMotorTwin();
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async disconnectMotor(): Promise<void> {
    await Promise.all([this.physical.disconnectMotor(), this.simulation.disconnectMotor()]);
  }

  async connectSensor(serialPort?: string): Promise<ConnectResult> {
    const { real, sim } = await this.connectSensorTwin(serialPort);
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async disconnectSensor(): Promise<ConnectResult> {
    const { real, sim } = await this.disconnectSensorTwin();
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async connect(): Promise<ConnectResult> {
    return this.connectMotor();
  }

  async disconnect(): Promise<void> {
    await this.disconnectMotor();
  }

  async setJogCmPerSec(cmPerSec: number, opts?: JogOptions): Promise<CommandResult> {
    const { real, sim } = await this.setJogCmPerSecTwin(cmPerSec, opts);
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async stop(): Promise<CommandResult> {
    const { real, sim } = await this.stopTwin();
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async moveToPositionCm(cm: number, opts?: MoveOptions): Promise<CommandResult> {
    const { real, sim } = await this.moveToPositionCmTwin(cm, opts);
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async setTravelLimits(limits: TravelLimitsCm): Promise<CommandResult> {
    const { real, sim } = await this.setTravelLimitsTwin(limits);
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async setLed(on: boolean): Promise<CommandResult> {
    const { real, sim } = await this.setLedTwin(on);
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async zeroCartAtCurrent(): Promise<CommandResult> {
    const { real, sim } = await this.zeroCartAtCurrentTwin();
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }
}
