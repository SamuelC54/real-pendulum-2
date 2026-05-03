import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  connectMotor,
  disconnectMotor,
  getMotorStatus,
  resetMotorGrpcClientForTests,
  setJogVelocityRpm,
  stopMotor,
} from "./motorClient.js";
import {
  createFakeMotorGrpcModel,
  startFakeMotorGrpcServer,
  type FakeMotorGrpcModel,
} from "./test-support/fakeMotorGrpcServer.js";

describe("motorClient integration (fake gRPC MotorService)", () => {
  let prevUrl: string | undefined;
  let model: FakeMotorGrpcModel;
  let close: () => Promise<void>;

  beforeAll(async () => {
    prevUrl = process.env.MOTOR_GRPC_URL;
    model = createFakeMotorGrpcModel({
      motor: {
        node_index: 1,
        node_type_code: 2,
        node_type_label: "TestNode",
        user_id: "u",
        firmware_version: "1",
        serial_number: 99,
        model: "M",
      },
    });
    const { url, close: shutdown } = await startFakeMotorGrpcServer(model);
    close = shutdown;
    process.env.MOTOR_GRPC_URL = url;
    resetMotorGrpcClientForTests();
  });

  afterAll(async () => {
    await close();
    if (prevUrl === undefined) delete process.env.MOTOR_GRPC_URL;
    else process.env.MOTOR_GRPC_URL = prevUrl;
    resetMotorGrpcClientForTests();
  });

  it("Connect → GetStatus round-trip", async () => {
    expect(model.connected).toBe(false);
    const connectRes = await connectMotor();
    expect(connectRes.ok).toBe(true);
    expect(model.connected).toBe(true);

    const st = await getMotorStatus();
    expect(st.connected).toBe(true);
    expect(st.commandedRpm).toBe(0);
    expect(st.detail).toContain("fake motor service");
    expect(st.motor?.nodeIndex).toBe(1);
    expect(st.motor?.serialNumber).toBe("99");
  });

  it("SetJogVelocity and Stop update commanded rpm", async () => {
    model.connected = true;
    await setJogVelocityRpm(42);
    const mid = await getMotorStatus();
    expect(mid.commandedRpm).toBe(42);

    await stopMotor();
    const end = await getMotorStatus();
    expect(end.commandedRpm).toBe(0);
  });

  it("Disconnect clears fake connected flag", async () => {
    model.connected = true;
    await disconnectMotor();
    expect(model.connected).toBe(false);
  });

  it("connect failure does not mark model connected", async () => {
    model.connectReply = { ok: false, error_message: "hub missing" };
    model.connected = false;
    const r = await connectMotor();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("hub missing");
    expect(model.connected).toBe(false);
    model.connectReply = { ok: true, error_message: "" };
  });
});
