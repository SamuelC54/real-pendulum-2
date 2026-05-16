import { describe, expect, it } from "vitest";
import { encoderCountsPerRevolution, encoderTicksPerRadian } from "./pendulum.js";

describe("pendulum encoder scale", () => {
  it("encoderTicksPerRadian matches counts per revolution", () => {
    const cpr = encoderCountsPerRevolution();
    expect(encoderTicksPerRadian()).toBeCloseTo(cpr / (2 * Math.PI), 9);
  });
});
