import { config } from "@real-pendulum/app-config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultSimulationGrpcUrl,
  resolveSimMotorGrpcUrl,
  resolveSimSensorGrpcUrl,
} from "./grpcSimDefaults.js";

describe("grpcSimDefaults", () => {
  let savedSim: (typeof config)["sim"];

  beforeEach(() => {
    savedSim = { ...config.sim };
  });

  afterEach(() => {
    Object.assign(config.sim, savedSim);
  });

  it("defaultSimulationGrpcUrl uses config.sim.simulationGrpcPort", () => {
    config.sim.simulationGrpcPort = 58870;
    expect(defaultSimulationGrpcUrl()).toBe("http://127.0.0.1:58870");

    config.sim.simulationGrpcPort = 60001;
    expect(defaultSimulationGrpcUrl()).toBe("http://127.0.0.1:60001");
  });

  it("resolveSimMotorGrpcUrl prefers motorSimGrpcUrl", () => {
    config.sim.motorSimGrpcUrl = "192.168.1.5:7777";
    config.sim.sensorSimGrpcUrl = undefined;
    expect(resolveSimMotorGrpcUrl()).toBe("http://192.168.1.5:7777");
  });

  it("resolveSimSensorGrpcUrl falls back to simulation default", () => {
    config.sim.motorSimGrpcUrl = undefined;
    config.sim.sensorSimGrpcUrl = undefined;
    config.sim.simulationGrpcPort = 58870;
    expect(resolveSimSensorGrpcUrl()).toBe("http://127.0.0.1:58870");
  });
});
