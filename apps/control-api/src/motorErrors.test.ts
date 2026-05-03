import { describe, expect, it } from "vitest";
import { friendlyMotorGrpcError } from "./motorErrors.js";

describe("friendlyMotorGrpcError", () => {
  it("wraps gRPC status code 14 (UNAVAILABLE)", () => {
    const err = Object.assign(new Error("whatever"), { code: 14 });
    const msg = friendlyMotorGrpcError("127.0.0.1:50051", err);
    expect(msg).toContain("Motor gRPC not reachable at 127.0.0.1:50051");
    expect(msg).toContain("whatever");
  });

  it("wraps ECONNREFUSED style messages", () => {
    const msg = friendlyMotorGrpcError("host:51", new Error("ECONNREFUSED"));
    expect(msg).toContain("Motor gRPC not reachable at host:51");
  });

  it("wraps UNAVAILABLE substring", () => {
    const msg = friendlyMotorGrpcError("x", new Error("UNAVAILABLE"));
    expect(msg).toContain("Motor gRPC not reachable");
  });

  it("passes through unrelated errors", () => {
    expect(friendlyMotorGrpcError("x", new Error("teknic_init failed (-2)"))).toBe(
      "teknic_init failed (-2)",
    );
  });

  it("stringifies non-Error throws", () => {
    expect(friendlyMotorGrpcError("x", "boom")).toBe("boom");
  });
});
