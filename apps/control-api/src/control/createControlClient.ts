import type { GrpcBackendMode } from "../grpcRequestContext.js";
import { PhysicalControlBackend } from "./backends/PhysicalControlBackend.js";
import { SimulationControlBackend } from "./backends/SimulationControlBackend.js";
import { TwinControlBackend } from "./backends/TwinControlBackend.js";
import { ControlClient } from "./ControlClient.js";
import type { ControlMode } from "./types.js";

export function createControlClient(mode: ControlMode | GrpcBackendMode): ControlClient {
  switch (mode) {
    case "hardware":
      return new ControlClient({ backend: new PhysicalControlBackend() });
    case "sim":
      return new ControlClient({ backend: new SimulationControlBackend() });
    case "twin":
      return new ControlClient({
        backend: new TwinControlBackend(
          new PhysicalControlBackend(),
          new SimulationControlBackend(),
        ),
      });
  }
}

export function createTwinControlBackend(): TwinControlBackend {
  return new TwinControlBackend(new PhysicalControlBackend(), new SimulationControlBackend());
}
