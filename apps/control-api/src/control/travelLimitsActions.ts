import { railStateForMode } from "./types.js";
import type { CommandResult, ControlMode, MachineStateSources, RailMachineState, TravelLimitsCm } from "./types.js";
import type { SymmetricTravelLimitsCm, TravelLimitsStore } from "./travelLimitsStore.js";

export async function recordTravelLimitSide(
  store: TravelLimitsStore,
  getSources: () => Promise<MachineStateSources>,
  mode: ControlMode,
  side: "left" | "right",
  onUpdated: () => void,
): Promise<CommandResult> {
  const state = railStateForMode(await getSources(), mode);
  if (!state.connection.cart) {
    return { ok: false, error: "Motor is not connected." };
  }
  if (state.cart.positionCm == null) {
    return { ok: false, error: "Cart position unavailable." };
  }
  const limits: TravelLimitsCm = {
    left: side === "left" ? state.cart.positionCm : state.cart.travelLimitsCm.left,
    right: side === "right" ? state.cart.positionCm : state.cart.travelLimitsCm.right,
  };
  store.setFromCm(limits);
  onUpdated();
  return { ok: true, error: "" };
}

export async function setSymmetricTravelSpan(
  store: TravelLimitsStore,
  getSources: () => Promise<MachineStateSources>,
  mode: ControlMode,
  halfSpanCm: number,
  onUpdated: () => void,
): Promise<CommandResult & SymmetricTravelLimitsCm> {
  const state = railStateForMode(await getSources(), mode);
  if (state.cart.positionCm == null) {
    throw new Error("Motor position unavailable.");
  }
  const span = store.setSymmetricAboutCm(state.cart.positionCm, halfSpanCm);
  onUpdated();
  return { ok: true, error: "", ...span };
}
