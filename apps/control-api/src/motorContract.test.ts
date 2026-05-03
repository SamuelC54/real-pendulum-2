import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapMotorInfo } from "./motorClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Golden wire payload (shape from `GetStatus` / proto field names) — update when `motor.proto` or mapping changes. */
describe("motor wire contract (fixtures)", () => {
  it("maps fixture motor block to MotorInfo", () => {
    const raw = readFileSync(
      path.join(__dirname, "fixtures/motor-status-wire.sample.json"),
      "utf8",
    );
    const body = JSON.parse(raw) as {
      motor?: Record<string, unknown>;
    };
    expect(body.motor).toBeDefined();
    const mapped = mapMotorInfo(body.motor as Parameters<typeof mapMotorInfo>[0]);
    expect(mapped).toMatchInlineSnapshot(`
      {
        "firmwareVersion": "2.3.0",
        "model": "CPM-SCSX",
        "nodeIndex": 0,
        "nodeTypeCode": 47,
        "nodeTypeLabel": "ClearPath-SC",
        "serialNumber": "123456789",
        "userId": "axis1",
      }
    `);
  });
});
