import { physicalBackend, simulationBackend, twinBackend } from "./backends/instances.js";
import type { ControlBackend, ControlMode } from "./types.js";

export { physicalBackend, simulationBackend, twinBackend } from "./backends/instances.js";

export function getControlBackend(mode: ControlMode): ControlBackend {
  switch (mode) {
    case "physical":
      return physicalBackend;
    case "simulation":
      return simulationBackend;
    case "twin":
      return twinBackend;
  }
}
