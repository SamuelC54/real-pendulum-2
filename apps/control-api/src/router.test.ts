import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./motorClient.js", () => ({
  motorGrpcTarget: vi.fn(() => "127.0.0.1:50051"),
  connectMotor: vi.fn(),
  disconnectMotor: vi.fn(),
  setJogVelocityRpm: vi.fn(),
  stopMotor: vi.fn(),
  getMotorStatus: vi.fn(),
}));

import * as motor from "./motorClient.js";
import { appRouter } from "./router.js";

describe("appRouter (motor mocked)", () => {
  beforeEach(() => {
    vi.mocked(motor.connectMotor).mockReset();
    vi.mocked(motor.disconnectMotor).mockReset();
    vi.mocked(motor.setJogVelocityRpm).mockReset();
    vi.mocked(motor.stopMotor).mockReset();
    vi.mocked(motor.getMotorStatus).mockReset();
  });

  it("status.get returns friendly detail when motor is unreachable", async () => {
    vi.mocked(motor.getMotorStatus).mockRejectedValue(
      Object.assign(new Error("14 UNAVAILABLE: Connection refused"), { code: 14 }),
    );
    const caller = appRouter.createCaller({});
    const res = await caller.status.get();
    expect(res.connected).toBe(false);
    expect(res.commandedRpm).toBe(0);
    expect(res.detail).toContain("Motor gRPC not reachable at 127.0.0.1:50051");
  });

  it("status.get returns live status when client succeeds", async () => {
    vi.mocked(motor.getMotorStatus).mockResolvedValue({
      connected: true,
      commandedRpm: 12.5,
      detail: "ok",
    });
    const caller = appRouter.createCaller({});
    const res = await caller.status.get();
    expect(res).toEqual({
      connected: true,
      commandedRpm: 12.5,
      detail: "ok",
    });
  });

  it("connection.connect wraps motor errors", async () => {
    vi.mocked(motor.connectMotor).mockRejectedValue(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller({});
    await expect(caller.connection.connect()).rejects.toThrow(/Motor gRPC not reachable/);
  });

  it("connection.connect returns motor result on success", async () => {
    vi.mocked(motor.connectMotor).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({});
    await expect(caller.connection.connect()).resolves.toEqual({ ok: true, error: "" });
  });

  it("jog.setVelocity forwards rpm", async () => {
    vi.mocked(motor.setJogVelocityRpm).mockResolvedValue({ ok: true, error: "" });
    const caller = appRouter.createCaller({});
    await caller.jog.setVelocity({ rpm: 100 });
    expect(motor.setJogVelocityRpm).toHaveBeenCalledWith(100);
  });
});
