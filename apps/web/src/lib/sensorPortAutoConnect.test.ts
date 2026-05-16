import { describe, expect, it } from "vitest";
import { resolveSensorPortForAutoConnect } from "./sensorPortAutoConnect";

describe("resolveSensorPortForAutoConnect", () => {
  it("prefers the only detected port", () => {
    expect(resolveSensorPortForAutoConnect([{ path: "COM3" }], "")).toBe("COM3");
    expect(resolveSensorPortForAutoConnect([{ path: "COM3" }], "COM5")).toBe("COM3");
  });

  it("uses saved port when multiple devices are listed", () => {
    expect(
      resolveSensorPortForAutoConnect([{ path: "COM3" }, { path: "COM5" }], "COM5"),
    ).toBe("COM5");
  });

  it("returns undefined when multiple ports and no saved choice", () => {
    expect(
      resolveSensorPortForAutoConnect([{ path: "COM3" }, { path: "COM5" }], ""),
    ).toBeUndefined();
  });
});
