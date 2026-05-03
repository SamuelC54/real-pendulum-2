import { z } from "zod";

/** Teknic **`motor_info`** JSON (snake_case) from **`teknic_get_motor_info_json`**. */
const TeknicMotorInfoWireSchema = z.object({
  node_index: z.number(),
  node_type_code: z.number(),
  node_type_label: z.string(),
  user_id: z.string(),
  firmware_version: z.string(),
  serial_number: z.union([z.number(), z.string()]),
  model: z.string(),
});

function serialToBigInt(v: number | string): bigint | null {
  try {
    return typeof v === "string" ? BigInt(v) : BigInt(Math.trunc(v));
  } catch {
    return null;
  }
}

/** Parses **`teknic_get_motor_info_json`** output (Teknic / **`motor_info.cpp`** snake_case JSON). */
export function motorInfoFromTeknicJson(json: string): {
  nodeIndex: number;
  nodeTypeCode: number;
  nodeTypeLabel: string;
  userId: string;
  firmwareVersion: string;
  serialNumber: bigint;
  model: string;
} | null {
  try {
    const raw: unknown = JSON.parse(json);
    const parsed = TeknicMotorInfoWireSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }
    const o = parsed.data;
    const serialNumber = serialToBigInt(o.serial_number);
    if (serialNumber === null) {
      return null;
    }
    return {
      nodeIndex: o.node_index,
      nodeTypeCode: o.node_type_code,
      nodeTypeLabel: o.node_type_label,
      userId: o.user_id,
      firmwareVersion: o.firmware_version,
      serialNumber,
      model: o.model,
    };
  } catch {
    return null;
  }
}
