import { afterEach, describe, expect, it } from "vitest";
import {
  defaultCoupledSimGrpcUrl,
  resolveSimMotorGrpcUrl,
  resolveSimSensorGrpcUrl,
} from "./grpcSimDefaults.js";

describe("grpcSimDefaults", () => {
  const envKeys = [
    "SIM_COUPLED_GRPC_PORT",
    "MOTOR_SIM_GRPC_URL",
    "SENSOR_SIM_GRPC_URL",
  ] as const;
  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of envKeys) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      delete snapshot[k];
    }
  });

  function stash(name: (typeof envKeys)[number]): void {
    if (!(name in snapshot)) snapshot[name] = process.env[name];
  }

  it("defaultCoupledSimGrpcUrl uses SIM_COUPLED_GRPC_PORT then 58870", () => {
    stash("SIM_COUPLED_GRPC_PORT");
    delete process.env.SIM_COUPLED_GRPC_PORT;
    expect(defaultCoupledSimGrpcUrl()).toBe("http://127.0.0.1:58870");

    process.env.SIM_COUPLED_GRPC_PORT = "60001";
    expect(defaultCoupledSimGrpcUrl()).toBe("http://127.0.0.1:60001");
  });

  it("resolveSimMotorGrpcUrl prefers MOTOR_SIM_GRPC_URL", () => {
    stash("MOTOR_SIM_GRPC_URL");
    stash("SIM_COUPLED_GRPC_PORT");
    delete process.env.SIM_COUPLED_GRPC_PORT;
    process.env.MOTOR_SIM_GRPC_URL = "192.168.1.5:7777";
    expect(resolveSimMotorGrpcUrl()).toBe("http://192.168.1.5:7777");
  });

  it("resolveSimSensorGrpcUrl falls back to coupled default", () => {
    stash("MOTOR_SIM_GRPC_URL");
    stash("SENSOR_SIM_GRPC_URL");
    stash("SIM_COUPLED_GRPC_PORT");
    delete process.env.MOTOR_SIM_GRPC_URL;
    delete process.env.SENSOR_SIM_GRPC_URL;
    delete process.env.SIM_COUPLED_GRPC_PORT;
    expect(resolveSimSensorGrpcUrl()).toBe("http://127.0.0.1:58870");
  });
});
