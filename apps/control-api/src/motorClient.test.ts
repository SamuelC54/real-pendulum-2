import { describe, expect, it } from "vitest";
import { mapMotorInfo } from "./motorClient.js";

describe("mapMotorInfo", () => {
  it("fills defaults for empty payload", () => {
    expect(mapMotorInfo({})).toEqual({
      nodeIndex: 0,
      nodeTypeCode: 0,
      nodeTypeLabel: "",
      userId: "",
      firmwareVersion: "",
      serialNumber: "",
      model: "",
    });
  });

  it("maps wire fields and serial number types", () => {
    expect(
      mapMotorInfo({
        node_index: 2,
        node_type_code: 42,
        node_type_label: "ClearPath",
        user_id: "u1",
        firmware_version: "1.0",
        serial_number: 999888,
        model: "SC",
      }),
    ).toEqual({
      nodeIndex: 2,
      nodeTypeCode: 42,
      nodeTypeLabel: "ClearPath",
      userId: "u1",
      firmwareVersion: "1.0",
      serialNumber: "999888",
      model: "SC",
    });
  });

  it("stringifies numeric serial from JSON-style input", () => {
    expect(mapMotorInfo({ serial_number: "ABC123" }).serialNumber).toBe("ABC123");
  });
});
