import { describe, expect, it } from "vitest";
import { MockControlBackend } from "./backends/MockControlBackend.js";
import { ControlClient } from "./ControlClient.js";

describe("ControlClient", () => {
  it("delegates setTravelLimits and setLed to the backend", async () => {
    const backend = new MockControlBackend();
    const client = new ControlClient({ backend, mode: "physical" });

    await client.setTravelLimits({ left: -10, right: 10 });
    await client.setLed(true);

    const state = await client.getState();
    expect(state.physical!.cart.travelLimitsCm).toEqual({ left: -10, right: 10 });
    expect(state.physical!.led.on).toBe(true);
  });
});
