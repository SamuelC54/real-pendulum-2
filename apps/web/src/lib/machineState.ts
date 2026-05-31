import type { RailMachineState } from "@real-pendulum/control-api/types";
import type { ControlBackendMode } from "@/stores/controlBackendMode";

export type { RailMachineState };

export type MachineSourceId = "physical" | "simulation";

export type MachineStateSources = Partial<Record<MachineSourceId, RailMachineState>>;

export function primarySourceKey(mode: ControlBackendMode): MachineSourceId {
  return mode === "simulation" ? "simulation" : "physical";
}

export function primaryMachineState(
  sources: MachineStateSources | undefined,
  mode: ControlBackendMode,
): RailMachineState | undefined {
  return sources?.[primarySourceKey(mode)];
}

export function simulationMachineState(
  sources: MachineStateSources | undefined,
): RailMachineState | undefined {
  return sources?.simulation;
}

export function machineStateRefetchInterval(query: {
  state: { data?: MachineStateSources };
}): number {
  const sources = query.state.data;
  if (!sources) return 1500;
  const legs = Object.values(sources);
  if (legs.length === 0) return 1500;
  const connected = legs.some((s) => s.connection.cart || s.connection.sensor);
  if (!connected) return 1500;
  return legs.length > 1 ? 300 : 80;
}

/** Travel limits in the `{ leftCm, rightCm }` shape used by rail visualizers. */
export function travelLimitsCm(state: RailMachineState | undefined): {
  leftCm: number | null;
  rightCm: number | null;
} {
  return {
    leftCm: state?.cart.travelLimitsCm.left ?? null,
    rightCm: state?.cart.travelLimitsCm.right ?? null,
  };
}
