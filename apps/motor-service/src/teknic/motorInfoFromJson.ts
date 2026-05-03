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
    const o = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof o.node_index !== "number" ||
      typeof o.node_type_code !== "number" ||
      typeof o.node_type_label !== "string" ||
      typeof o.user_id !== "string" ||
      typeof o.firmware_version !== "string" ||
      (typeof o.serial_number !== "number" && typeof o.serial_number !== "string") ||
      typeof o.model !== "string"
    ) {
      return null;
    }
    const sn = o.serial_number;
    const serialNumber =
      typeof sn === "string" ? BigInt(sn) : BigInt(Math.trunc(Number(sn)));
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
