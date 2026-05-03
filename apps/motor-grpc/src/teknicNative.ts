import fs from "node:fs";
import path from "node:path";
import koffi from "koffi";

export type TeknicNative = {
  init(): number;
  shutdown(): void;
  setVelocityRpm(rpm: number): number;
  stop(): number;
  getCommandedRpm(): number;
  isConnected(): boolean;
  getDetail(): string;
  /** UTF-8 JSON from Teknic `IInfo`, or null if not connected / error. */
  getMotorInfoJson(): string | null;
};

/** Prefer TEKNIC_DLL; otherwise look under native/build next to this package. */
export function resolveTeknicDll(fromDir: string): string | null {
  const envPath = process.env.TEKNIC_DLL;
  if (envPath && fs.existsSync(envPath)) {
    return path.resolve(envPath);
  }

  const candidates = [
    path.join(fromDir, "..", "native", "build", "Release", "teknic_motor.dll"),
    path.join(fromDir, "..", "native", "build", "Debug", "teknic_motor.dll"),
    path.join(fromDir, "..", "..", "native", "build", "Release", "teknic_motor.dll"),
  ];

  for (const c of candidates) {
    const abs = path.resolve(c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

export function loadTeknic(dllPath: string): TeknicNative {
  const lib = koffi.load(dllPath);

  const teknic_init = lib.func("int teknic_init(void)");
  const teknic_shutdown = lib.func("void teknic_shutdown(void)");
  const teknic_set_velocity_rpm = lib.func("int teknic_set_velocity_rpm(double rpm)");
  const teknic_stop = lib.func("int teknic_stop(void)");
  const teknic_get_commanded_rpm = lib.func("double teknic_get_commanded_rpm(void)");
  const teknic_is_connected = lib.func("int teknic_is_connected(void)");
  const teknic_get_detail = lib.func("const char *teknic_get_detail(void)");
  const teknic_get_motor_info_json = lib.func("int teknic_get_motor_info_json(_Out_ char *out, int cap)");

  return {
    init: () => Number(teknic_init()),
    shutdown: () => {
      teknic_shutdown();
    },
    setVelocityRpm: (rpm: number) => Number(teknic_set_velocity_rpm(rpm)),
    stop: () => Number(teknic_stop()),
    getCommandedRpm: () => Number(teknic_get_commanded_rpm()),
    isConnected: () => Number(teknic_is_connected()) !== 0,
    getDetail: () => String(teknic_get_detail() ?? ""),
    getMotorInfoJson: () => {
      const cap = 8192;
      const buf = Buffer.alloc(cap);
      const rc = Number(teknic_get_motor_info_json(buf, cap));
      if (rc < 0) return null;
      return buf.toString("utf8", 0, rc);
    },
  };
}
