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
import { clearLimitSwitchMode, getLimitSwitchModeStatus, updateMotorPosition } from "./state.js";
import { moveHomeWhileLatched } from "./moveHome.js";
import { cmToTeknicMeasured } from "../railPositionCm.js";
import {
  physicalBackend,
  resetTravelLimitsStateForTests,
} from "../control/backends/instances.js";

describe("moveHomeWhileLatched", () => {
  beforeEach(() => {
    resetTravelLimitsStateForTests();
    clearLimitSwitchMode();
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
    physicalBackend.travelLimits.setSymmetricAboutCm(0, 10);
    updateMotorPosition(-11, physicalBackend.getTravelLimits());
    expect(getLimitSwitchModeStatus().latched).toBe(true);

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

    const result = await moveHomeWhileLatched("physical");
    expect(result.ok).toBe(true);
    expect(motor.moveToPosition).toHaveBeenCalled();
    expect(getLimitSwitchModeStatus().latched).toBe(false);
  });
});
