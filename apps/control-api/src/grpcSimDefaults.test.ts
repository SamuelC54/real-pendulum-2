import { config } from "@real-pendulum/app-config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultCoupledSimGrpcUrl,
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

  it("defaultCoupledSimGrpcUrl uses config.sim.coupledGrpcPort", () => {
    config.sim.coupledGrpcPort = 58870;
    expect(defaultCoupledSimGrpcUrl()).toBe("http://127.0.0.1:58870");

    config.sim.coupledGrpcPort = 60001;
    expect(defaultCoupledSimGrpcUrl()).toBe("http://127.0.0.1:60001");
  });

  it("resolveSimMotorGrpcUrl prefers motorSimGrpcUrl", () => {
    config.sim.motorSimGrpcUrl = "192.168.1.5:7777";
    config.sim.sensorSimGrpcUrl = undefined;
    expect(resolveSimMotorGrpcUrl()).toBe("http://192.168.1.5:7777");
  });

  it("resolveSimSensorGrpcUrl falls back to coupled default", () => {
    config.sim.motorSimGrpcUrl = undefined;
    config.sim.sensorSimGrpcUrl = undefined;
    config.sim.coupledGrpcPort = 58870;
    expect(resolveSimSensorGrpcUrl()).toBe("http://127.0.0.1:58870");
  });
});
