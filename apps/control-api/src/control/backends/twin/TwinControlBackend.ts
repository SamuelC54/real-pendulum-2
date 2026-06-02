import { withControlBackend } from "../../../helpers/backendContext.js";
import type { SymmetricTravelLimitsCm } from "../../travelLimitsStore.js";
import type {
  CommandResult,
  ConnectResult,
  ControlBackend,
  JogOptions,
  MoveOptions,
  MachineStateSources,
  RailMachineState,
  TravelLimitsCm,
  Unsubscribe,
} from "../../types.js";

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
  readonly mode = "twin" as const;

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

  subscribeToState(callback: (state: MachineStateSources) => void): Unsubscribe {
    const forward = () => {
      void this.getState().then(callback);
    };
    const offPhysical = this.physical.subscribeToState(forward);
    const offSimulation = this.simulation.subscribeToState(forward);
    return () => {
      offPhysical();
      offSimulation();
    };
  }

  async getPhysicalState(): Promise<RailMachineState> {
    return withControlBackend("physical", async () => (await this.physical.getState()).physical!);
  }

  async getSimulationState(): Promise<RailMachineState> {
    return withControlBackend("simulation", async () => (await this.simulation.getState()).simulation!);
  }

  async connectTwin(): Promise<TwinWireResult<ConnectResult>> {
    return twinRun(this.physical, this.simulation, (b) => b.connectMotor());
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
    return twinRun(this.physical, this.simulation, (b) => b.disconnectMotor());
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

  getTravelLimits(): TravelLimitsCm {
    return this.physical.getTravelLimits();
  }

  async recordTravelLimitSide(side: "left" | "right"): Promise<CommandResult> {
    const { real, sim } = await twinRun(this.physical, this.simulation, (b) =>
      b.recordTravelLimitSide(side),
    );
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return { ok: true, error: "" };
  }

  async setSymmetricTravelSpan(
    halfSpanCm: number,
  ): Promise<CommandResult & SymmetricTravelLimitsCm> {
    const { real, sim } = await twinRun(this.physical, this.simulation, (b) =>
      b.setSymmetricTravelSpan(halfSpanCm),
    );
    if (!real.ok) return real;
    if (!sim.ok) return sim;
    return real;
  }

  applyHomingTravelLimits(
    posAtLeftMotor: number,
    posAtRightMotor: number,
    zeroedAtMid: boolean,
  ): void {
    this.physical.applyHomingTravelLimits(posAtLeftMotor, posAtRightMotor, zeroedAtMid);
    this.simulation.applyHomingTravelLimits(posAtLeftMotor, posAtRightMotor, zeroedAtMid);
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
