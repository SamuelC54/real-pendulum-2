import { PhysicalControlBackend } from "./backends/PhysicalControlBackend.js";
import { SimulationControlBackend } from "./backends/SimulationControlBackend.js";
import { TwinControlBackend } from "./backends/TwinControlBackend.js";
import { ControlClient } from "./ControlClient.js";
import type { ControlMode } from "./types.js";

export function createControlClient(mode: ControlMode): ControlClient {
  switch (mode) {
    case "physical":
      return new ControlClient({ backend: new PhysicalControlBackend(), mode: "physical" });
    case "simulation":
      return new ControlClient({ backend: new SimulationControlBackend(), mode: "simulation" });
    case "twin":
      return new ControlClient({
        backend: new TwinControlBackend(
          new PhysicalControlBackend(),
          new SimulationControlBackend(),
        ),
        mode: "twin",
      });
  }
}

export function createTwinControlBackend(): TwinControlBackend {
  return new TwinControlBackend(new PhysicalControlBackend(), new SimulationControlBackend());
}
