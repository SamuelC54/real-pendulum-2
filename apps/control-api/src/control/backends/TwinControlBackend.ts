import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  RailMachineState,
  TravelLimitsCm,
} from "../types.js";

export type TwinWireResult<T> = { real: T; sim: T };

async function twinRun<T>(
  physical: ControlBackend,
  simulation: ControlBackend,
  fn: (b: ControlBackend) => Promise<T>,
): Promise<TwinWireResult<T>> {
  const [real, sim] = await Promise.all([fn(physical), fn(simulation)]);
  return { real, sim };
}

export class TwinControlBackend implements ControlBackend {
  constructor(
    readonly physical: ControlBackend,
    readonly simulation: ControlBackend,
  ) {}

  async getState(): Promise<RailMachineState> {
    return this.physical.getState();
  }

  async getPhysicalState(): Promise<RailMachineState> {
    return this.physical.getState();
  }

  async getSimulationState(): Promise<RailMachineState> {
    return this.simulation.getState();
  }

  async connectTwin(): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.connect());
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

  // ControlBackend — composite (both must succeed for merged ok)
  async connect(): Promise<ConnectResult> {
    const { real, sim } = await this.connectTwin();
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.physical.disconnect(), this.simulation.disconnect()]);
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
}
