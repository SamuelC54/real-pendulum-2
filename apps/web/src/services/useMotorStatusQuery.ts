import { useAtomValue } from "jotai";

import {
  machineStateRefetchInterval,
  primaryMachineState,
  primarySourceKey,
  simulationMachineState,
  type MachineStateSources,
  type RailMachineState,
} from "@/lib/machineState";
import { controlBackendModeAtom, type ControlBackendMode } from "@/stores/controlBackendMode";

import { trpc } from "@/trpc";

export type TwinMachineState = RailMachineState & {
  twinSim?: RailMachineState;
};

function withTwinSim(
  primary: RailMachineState | undefined,
  sources: MachineStateSources | undefined,
  mode: ControlBackendMode,
): TwinMachineState | undefined {
  if (!primary) return undefined;
  const sim = mode === "twin" ? simulationMachineState(sources) : undefined;
  return sim ? { ...primary, twinSim: sim } : primary;
}

export function useMotorStatusConnected() {
  const mode = useAtomValue(controlBackendModeAtom);

  return trpc.machine.state.get.useQuery(undefined, {
    refetchInterval: machineStateRefetchInterval,
    select: (row) => {
      if (!row) return false;
      if (mode === "twin") {
        const physical = row.physical;
        const simulation = row.simulation;
        return (
          (physical?.connection.cart ?? false) ||
          (simulation?.connection.cart ?? false)
        );
      }
      return row[primarySourceKey(mode)]?.connection.cart ?? false;
    },
  });
}

export function useSensorStatusConnected() {
  const mode = useAtomValue(controlBackendModeAtom);
  const sub = trpc.machine.state.subscribe.useSubscription(undefined);

  return {
    ...sub,
    data:
      mode === "twin"
        ? (sub.data?.physical?.connection.sensor ?? false)
        : (sub.data?.[primarySourceKey(mode)]?.connection.sensor ?? false),
    isFetching: sub.status === "connecting",
  };
}

export function useTwinLinkageStatus() {
  const mode = useAtomValue(controlBackendModeAtom);
  const split = trpc.machine.state.get.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: machineStateRefetchInterval,
    select: (row) => ({
      motorPhysical: row?.physical?.connection.cart ?? false,
      sensorPhysical: row?.physical?.connection.sensor ?? false,
      motorSim: row?.simulation?.connection.cart ?? false,
      sensorSim: row?.simulation?.connection.sensor ?? false,
    }),
  });
  const row = split.data;
  return {
    motorPhysical: row?.motorPhysical ?? false,
    sensorPhysical: row?.sensorPhysical ?? false,
    motorSim: row?.motorSim ?? false,
    sensorSim: row?.sensorSim ?? false,
  };
}

/** Primary {@link RailMachineState} for the active backend mode; twin adds `twinSim`. */
export function useMotorStatusQuery() {
  const mode = useAtomValue(controlBackendModeAtom);
  const q = trpc.machine.state.get.useQuery(undefined, {
    refetchInterval: machineStateRefetchInterval,
    select: (row) => withTwinSim(primaryMachineState(row, mode), row, mode),
  });
  return q;
}

export function useTwinSensorStatusQuery() {
  const mode = useAtomValue(controlBackendModeAtom);
  return trpc.machine.state.subscribe.useSubscription(undefined, {
    enabled: mode === "twin",
  });
}

/** Primary {@link RailMachineState} from SSE; twin adds `twinSim`. */
export function useSensorStatusQuery() {
  const mode = useAtomValue(controlBackendModeAtom);
  const sub = trpc.machine.state.subscribe.useSubscription(undefined);
  const primary = primaryMachineState(sub.data, mode);
  const data = withTwinSim(primary, sub.data, mode);
  return {
    ...sub,
    data,
    isFetching: sub.status === "connecting",
  };
}
