/** Parses **`teknic_get_motor_info_json`** output — same shape as **`motor_info.cpp`**. */
export type MotorInfoWire = {
  node_index: number;
  node_type_code: number;
  node_type_label: string;
  user_id: string;
  firmware_version: string;
  serial_number: number;
  model: string;
};

export function motorInfoFromTeknicJson(json: string): MotorInfoWire | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof o.node_index !== "number" ||
      typeof o.node_type_code !== "number" ||
      typeof o.node_type_label !== "string" ||
      typeof o.user_id !== "string" ||
      typeof o.firmware_version !== "string" ||
      typeof o.serial_number !== "number" ||
      typeof o.model !== "string"
    ) {
      return null;
    }
    return {
      node_index: o.node_index,
      node_type_code: o.node_type_code,
      node_type_label: o.node_type_label,
      user_id: o.user_id,
      firmware_version: o.firmware_version,
      serial_number: o.serial_number,
      model: o.model,
    };
  } catch {
    return null;
  }
}
