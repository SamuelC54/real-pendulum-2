import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@real-pendulum/physical-motor-service/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/physical-motor-service/sdk")>();
  return {
    ...actual,
    getMotorStatus: vi.fn(),
    moveToPosition: vi.fn(),
  };
});

vi.mock("@real-pendulum/physical-sensor-service/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@real-pendulum/physical-sensor-service/sdk")>();
  return {
    ...actual,
    getSensorStatus: vi.fn(),
  };
});

import * as motor from "@real-pendulum/physical-motor-service/sdk";
import * as sensor from "@real-pendulum/physical-sensor-service/sdk";
import {
  clearMotionLatch,
  getMotionLatchStatus,
  updateMotorPositionForLatch,
} from "./motionLatch.js";
import { moveHomeWhileLatched } from "./motionLatchMoveHome.js";
import { withGrpcBackendMode } from "./grpcRequestContext.js";
import { cmToTeknicMeasured } from "./railPositionCm.js";
import {
  resetTravelLimitsStateForTests,
  setTravelLimitsSymmetricAboutCm,
} from "./railTravelLimits.js";

describe("moveHomeWhileLatched", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
    clearMotionLatch();
    vi.mocked(motor.moveToPosition).mockReset().mockResolvedValue({ ok: true, error: "" });
    vi.mocked(sensor.getSensorStatus).mockReset().mockResolvedValue({
      connected: true,
      ledOn: false,
      detail: "",
      serialPort: "",
      encoderTicks: 0,
      limitLeftPressed: false,
      limitRightPressed: false,
    });
    vi.mocked(motor.getMotorStatus).mockReset();
  });

  it("holds recovery until position reaches home and clears latch when safe", async () => {
    withGrpcBackendMode("hardware", () => {
      setTravelLimitsSymmetricAboutCm(0, 10);
      updateMotorPositionForLatch(-11);
    });
    expect(getMotionLatchStatus().latched).toBe(true);

    let reads = 0;
    const farTeknic = cmToTeknicMeasured(-11);
    vi.mocked(motor.getMotorStatus).mockImplementation(async () => {
      reads += 1;
      const teknic = reads < 4 ? farTeknic : 0;
      return {
        connected: true,
        commandedRpm: 0,
        detail: "",
        measuredPosition: teknic,
      };
    });

    const result = await withGrpcBackendMode("hardware", () => moveHomeWhileLatched("hardware"));
    expect(result.ok).toBe(true);
    expect(motor.moveToPosition).toHaveBeenCalled();
    expect(getMotionLatchStatus().latched).toBe(false);
  });
});
