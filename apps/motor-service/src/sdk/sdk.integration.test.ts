import { create } from "@bufbuild/protobuf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConnectReplySchema } from "@real-pendulum/motor-proto/gen/motor_pb.js";
import {
  connectMotor,
  disconnectMotor,
  getMotorStatus,
  moveToPosition,
  resetMotorGrpcClientForTests,
  setJogVelocityRpm,
  stopMotor,
  zeroMeasuredPosition,
} from "./index.js";
import {
  createFakeMotorGrpcModel,
  startFakeMotorGrpcServer,
  type FakeMotorGrpcModel,
} from "../test-support/fakeMotorGrpcServer.js";

describe("MotorService SDK (fake Connect server)", () => {
  let prevUrl: string | undefined;
  let model: FakeMotorGrpcModel;
  let close: () => Promise<void>;

  beforeAll(async () => {
    prevUrl = process.env.MOTOR_GRPC_URL;
    model = createFakeMotorGrpcModel({
      motor: {
        nodeIndex: 1,
        nodeTypeCode: 2,
        nodeTypeLabel: "TestNode",
        userId: "u",
        firmwareVersion: "1",
        serialNumber: BigInt(99),
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

  it("GetStatus includes measured position", async () => {
    model.connected = true;
    model.measuredPosition = 1234.5;
    const st = await getMotorStatus();
    expect(st.measuredPosition).toBe(1234.5);
  });

  it("ZeroMeasuredPosition clears fake measured position", async () => {
    model.connected = true;
    model.measuredPosition = 500;
    const z = await zeroMeasuredPosition();
    expect(z.ok).toBe(true);
    expect(model.measuredPosition).toBe(0);
  });

  it("MoveToPosition sets fake measured position (Teknic counts)", async () => {
    model.connected = true;
    model.measuredPosition = 10;
    model.commandedRpm = 50;
    const r = await moveToPosition(-42);
    expect(r.ok).toBe(true);
    expect(model.commandedRpm).toBe(0);
    expect(model.measuredPosition).toBe(-42);
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
    model.connectReply = create(ConnectReplySchema, {
      ok: false,
      errorMessage: "hub missing",
    });
    model.connected = false;
    const r = await connectMotor();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("hub missing");
    expect(model.connected).toBe(false);
    model.connectReply = create(ConnectReplySchema, { ok: true, errorMessage: "" });
  });
});
