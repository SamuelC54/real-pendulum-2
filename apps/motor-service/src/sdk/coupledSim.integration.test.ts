import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SensorService } from "@real-pendulum/motor-proto/gen/sensor_pb.js";
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
  createCoupledSimGrpcModel,
  startCoupledSimGrpcServer,
  type CoupledSimGrpcModel,
} from "../test-support/coupledSimGrpcServer.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Coupled sim (MotorService + SensorService, one plant)", () => {
  let prevMotorUrl: string | undefined;
  let model: CoupledSimGrpcModel;
  let url: string;
  let close: () => Promise<void>;
  let sensor: ReturnType<typeof createClient<typeof SensorService>>;

  beforeAll(async () => {
    prevMotorUrl = process.env.MOTOR_GRPC_URL;
    model = createCoupledSimGrpcModel({
      metersPerDisplayCount: 1e-4,
      mpsPerRpm: 0.001,
      limitLeftXM: -0.01,
      limitRightXM: 0.4,
    });
    const started = await startCoupledSimGrpcServer(model, { port: 0 });
    url = started.url;
    close = started.close;
    process.env.MOTOR_GRPC_URL = url;
    resetMotorGrpcClientForTests();
    sensor = createClient(
      SensorService,
      createConnectTransport({ baseUrl: url, httpVersion: "1.1" }),
    );
  });

  afterAll(async () => {
    await close();
    if (prevMotorUrl === undefined) delete process.env.MOTOR_GRPC_URL;
    else process.env.MOTOR_GRPC_URL = prevMotorUrl;
    resetMotorGrpcClientForTests();
  });

  it("connects motor and sensor to the same host", async () => {
    const mc = await connectMotor();
    expect(mc.ok).toBe(true);
    const sc = await sensor.connect({});
    expect(sc.ok).toBe(true);
    await sensor.disconnect({});
    await disconnectMotor();
  });

  it("moveToPosition uses Teknic counts → plant xM (display sign)", async () => {
    await connectMotor();
    const r = await moveToPosition(100);
    expect(r.ok).toBe(true);
    expect(model.plant.state.xM).toBeCloseTo(-0.01, 8);
    const st = await getMotorStatus();
    expect(st.measuredPosition).toBeCloseTo(100, 4);
    await disconnectMotor();
  });

  it("jog advances encoder between sensor polls (shared plant)", async () => {
    await connectMotor();
    await sensor.connect({});
    await setJogVelocityRpm(200);
    await sleep(60);
    const s1 = await sensor.getStatus({});
    await sleep(40);
    const s2 = await sensor.getStatus({});
    expect(s2.encoderTicks).not.toBe(s1.encoderTicks);
    await stopMotor();
    const s3 = await sensor.getStatus({});
    const st = await getMotorStatus();
    expect(st.connected).toBe(true);
    expect(s3.connected).toBe(true);
    await sensor.disconnect({});
    await disconnectMotor();
  });

  it("limits follow plant xM when sensor is connected", async () => {
    await connectMotor();
    await sensor.connect({});
    await moveToPosition(100);
    const s = await sensor.getStatus({});
    expect(s.limitLeftPressed).toBe(true);
    expect(s.limitRightPressed).toBe(false);
    await sensor.disconnect({});
    await disconnectMotor();
  });

  it("zeroMeasuredPosition clears cart position in plant", async () => {
    await connectMotor();
    await moveToPosition(50);
    const z = await zeroMeasuredPosition();
    expect(z.ok).toBe(true);
    expect(model.plant.state.xM).toBe(0);
    const st = await getMotorStatus();
    expect(st.measuredPosition).toBeCloseTo(0, 5);
    await disconnectMotor();
  });

  it("GET/PATCH /admin/config updates plant tunables", async () => {
    const getRes = await fetch(`${url}/admin/config`);
    expect(getRes.ok).toBe(true);
    const before = (await getRes.json()) as { mpsPerRpm: number; plant: { pendulumLengthM: number } };
    const patchRes = await fetch(`${url}/admin/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mpsPerRpm: before.mpsPerRpm * 2, plant: { pendulumLengthM: 0.42 } }),
    });
    expect(patchRes.ok).toBe(true);
    const after = (await patchRes.json()) as { mpsPerRpm: number; plant: { pendulumLengthM: number } };
    expect(after.mpsPerRpm).toBeCloseTo(before.mpsPerRpm * 2);
    expect(after.plant.pendulumLengthM).toBe(0.42);
    expect(model.mpsPerRpm).toBeCloseTo(before.mpsPerRpm * 2);
    expect(model.plant.config.pendulumLengthM).toBe(0.42);
  });
});
