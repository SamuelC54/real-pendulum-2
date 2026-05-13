import { describe, expect, it } from "vitest";
import { createCartPendulumPlant, encoderTicksInt, stepCartPendulum } from "./cartPendulumPlant.js";

describe("cartPendulumPlant", () => {
  it("pendulum crosses opposite sign within ~½ small‑angle period", () => {
    const L = 0.25;
    const g = 9.81;
    const plant = createCartPendulumPlant({
      pendulumLengthM: L,
      gravity: g,
      angularDampingPerSec: 0,
      cartVelocityTrackingPerSec: 100,
    });
    plant.state.vCmdMps = 0;
    plant.state.thetaRad = 0.1;
    plant.state.omegaRps = 0;

    const dt = 1 / 500;
    const expectedHalf = Math.PI * Math.sqrt(L / g);
    const initial = plant.state.thetaRad;
    const maxSteps = Math.ceil((expectedHalf * 1.35) / dt);
    for (let i = 0; i < maxSteps; i++) {
      stepCartPendulum(plant, dt);
    }
    expect(initial * plant.state.thetaRad).toBeLessThan(0);
  });

  it("cart acceleration couples into pendulum during velocity transient", () => {
    const plant = createCartPendulumPlant({
      pendulumLengthM: 0.4,
      cartVelocityTrackingPerSec: 4,
      angularDampingPerSec: 0.01,
    });
    plant.state.thetaRad = 0;
    plant.state.omegaRps = 0;
    plant.state.vCmdMps = 0.25;
    const omegaStart = plant.state.omegaRps;
    for (let i = 0; i < 80; i++) {
      stepCartPendulum(plant, 1 / 200);
    }
    expect(Math.abs(plant.state.omegaRps - omegaStart)).toBeGreaterThan(0.05);
    expect(encoderTicksInt(plant)).not.toBe(0);
  });
});
