import { PhysicalControlBackend } from "./physical/PhysicalControlBackend.js";
import { SimulationControlBackend } from "./simulation/SimulationControlBackend.js";
import { TwinControlBackend } from "./twin/TwinControlBackend.js";

export const physicalBackend = new PhysicalControlBackend();
export const simulationBackend = new SimulationControlBackend();
export const twinBackend = new TwinControlBackend(physicalBackend, simulationBackend);

/** @internal Vitest */
export function resetTravelLimitsStateForTests(): void {
  physicalBackend.resetTravelLimitsForTests();
  simulationBackend.resetTravelLimitsForTests();
}
